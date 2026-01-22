import Stripe from "stripe";
import { pool } from "../db/connection";
import { rewardsService } from "./rewardsService";

/**
 * Stripe Connect Architecture:
 * 
 * Platform Credentials (optional, for backward compatibility):
 * - STRIPE_SECRET_KEY: Platform's secret key (fallback if retailer doesn't provide their own)
 * - STRIPE_CLIENT_ID: Platform's OAuth client ID (used to generate OAuth URLs)
 * 
 * Retailer Accounts (each retailer has their own):
 * - Each retailer connects their own Stripe Connect account via OAuth or manual linking
 * - Each retailer's account ID (acct_xxx) is stored in stripe_connect_accounts table
 * - Each retailer can optionally provide their own secret key (stripe_secret_key)
 * - When making API calls:
 *   - If retailer has their own secret key: use retailer's key
 *   - Otherwise: use platform key (if available) and specify the retailer's account ID
 * 
 * Example:
 * - Retailer A has account: acct_1234567890, secret key: sk_test_abc123
 * - Retailer B has account: acct_0987654321, no secret key (uses platform key)
 * - Each retailer's payments go to their own account
 */

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || "";
const STRIPE_PLATFORM_ACCOUNT_ID = process.env.STRIPE_PLATFORM_ACCOUNT_ID || "";
const STRIPE_CLIENT_ID = process.env.STRIPE_CLIENT_ID || "";
const DEFAULT_COMMISSION_RATE = parseFloat(process.env.PLATFORM_COMMISSION_RATE || "0.10");
const BASE_CURRENCY = (process.env.BASE_CURRENCY || "GBP").toLowerCase();

export class StripeService {
  private stripe: Stripe;
  private platformAccountId?: string;

  constructor() {
    // Platform key is optional now - retailers can use their own keys
    // But we still initialize with platform key for backward compatibility
    // If no platform key, we'll use retailer-specific keys when making calls
    if (STRIPE_SECRET_KEY) {
      this.stripe = new Stripe(STRIPE_SECRET_KEY, {
        apiVersion: "2025-12-15.clover",
      });
    } else {
      // Create a dummy instance - will be replaced by retailer-specific instances
      // This is only used as a fallback if retailer doesn't have their own key
      console.warn("[Stripe] No platform STRIPE_SECRET_KEY set. Retailers must provide their own secret keys.");
      this.stripe = new Stripe("sk_test_dummy_placeholder", {
        apiVersion: "2025-12-15.clover",
      });
    }
  }

  /**
   * Get a Stripe instance for a specific retailer
   * Uses retailer's own secret key if available, otherwise falls back to platform key
   */
  private async getStripeInstanceForRetailer(retailerId: string): Promise<Stripe> {
    try {
      const result = await pool.query(
        "SELECT stripe_secret_key FROM stripe_connect_accounts WHERE retailer_id = $1",
        [retailerId]
      );

      // If retailer has their own secret key, use it
      if (result.rows.length > 0 && result.rows[0].stripe_secret_key) {
        return new Stripe(result.rows[0].stripe_secret_key, {
          apiVersion: "2025-12-15.clover",
        });
      }

      // Otherwise, use platform key (if available)
      if (STRIPE_SECRET_KEY) {
        return new Stripe(STRIPE_SECRET_KEY, {
          apiVersion: "2025-12-15.clover",
        });
      }

      throw new Error("No Stripe secret key configured for this retailer and no platform key available");
    } catch (error: any) {
      console.error("[Stripe] Failed to get Stripe instance for retailer:", error);
      // Fallback to platform key
      if (STRIPE_SECRET_KEY) {
        return new Stripe(STRIPE_SECRET_KEY, {
          apiVersion: "2025-12-15.clover",
        });
      }
      throw error;
    }
  }

  private async getPlatformAccount(): Promise<Stripe.Account> {
    if (this.platformAccountId) {
      return this.stripe.accounts.retrieve(this.platformAccountId);
    }

    const account = STRIPE_PLATFORM_ACCOUNT_ID
      ? await this.stripe.accounts.retrieve(STRIPE_PLATFORM_ACCOUNT_ID)
      : await this.stripe.accounts.retrieve();

    this.platformAccountId = account.id;
    return account;
  }

  private async getCommissionRateForRetailer(retailerId: string): Promise<number> {
    try {
      // First, check if retailer is in trial period
      const retailerResult = await pool.query(
        `SELECT commission_rate_override, trial_ends_at, billing_status 
         FROM retailers WHERE id = $1`,
        [retailerId]
      );

      if (retailerResult.rows.length > 0) {
        const retailer = retailerResult.rows[0];
        const now = new Date();
        const trialEndsAt = retailer.trial_ends_at ? new Date(retailer.trial_ends_at) : null;

        // If in trial period, return 0% commission
        if (trialEndsAt && trialEndsAt > now) {
          console.log(`[Stripe] Retailer ${retailerId} is in trial period (ends ${trialEndsAt.toISOString()}), using 0% commission`);
          return 0;
        }

        // Check for retailer-specific commission override
        if (retailer.commission_rate_override !== null && retailer.commission_rate_override !== undefined) {
          const overrideRate = parseFloat(retailer.commission_rate_override);
          if (!isNaN(overrideRate) && overrideRate >= 0 && overrideRate <= 1) {
            console.log(`[Stripe] Using retailer-specific commission rate ${overrideRate} for retailer ${retailerId}`);
            return overrideRate;
          }
        }
      }

      // Fallback to platform default commission rate
      const result = await pool.query(
        "SELECT setting_value FROM platform_settings WHERE setting_key = 'commission_rate'"
      );

      if (result.rows.length > 0 && result.rows[0].setting_value) {
        const rate = parseFloat(result.rows[0].setting_value);
        if (!isNaN(rate) && rate >= 0 && rate <= 1) {
          return rate;
        }
      }

      console.warn("[Stripe] Commission rate not found in database or invalid, using default:", DEFAULT_COMMISSION_RATE);
      return DEFAULT_COMMISSION_RATE;
    } catch (error: any) {
      console.error("[Stripe] Failed to fetch commission rate from database, using default:", error?.message);
      return DEFAULT_COMMISSION_RATE;
    }
  }

  async createConnectAccount(retailerId: string, email: string, businessName: string) {
    try {
      const existing = await pool.query(
        "SELECT stripe_account_id FROM stripe_connect_accounts WHERE retailer_id = $1",
        [retailerId]
      );
      if (existing.rows.length > 0) {
        const existingAccountId = existing.rows[0].stripe_account_id;
        const existingAccount = await this.stripe.accounts.retrieve(existingAccountId);
        return existingAccount;
      }

      const account = await this.getPlatformAccount();

      await pool.query(
        `INSERT INTO stripe_connect_accounts (retailer_id, stripe_account_id, onboarding_completed, charges_enabled, payouts_enabled)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (retailer_id) 
         DO UPDATE SET stripe_account_id = $2, updated_at = CURRENT_TIMESTAMP`,
        [
          retailerId,
          account.id,
          true,
          account.charges_enabled,
          account.payouts_enabled,
        ]
      );

      return account;
    } catch (error: any) {
      console.error("[Stripe] Failed to connect account:", error);
      throw error;
    }
  }

  getOAuthAuthorizeUrl(opts: {
    retailerId: string;
    email: string;
    businessName?: string;
    redirectUri: string;
    state: string;
  }) {
    if (!STRIPE_CLIENT_ID) {
      throw new Error("STRIPE_CLIENT_ID environment variable is not set. OAuth flow requires STRIPE_CLIENT_ID. For demo/testing, use manual account linking instead.");
    }

    const url = this.stripe.oauth.authorizeUrl({
      response_type: "code",
      client_id: STRIPE_CLIENT_ID,
      scope: "read_write",
      redirect_uri: opts.redirectUri,
      state: opts.state,
      stripe_user: {
        email: opts.email,
        business_name: opts.businessName,
      },
    });

    return url;
  }

  async exchangeOAuthCode(code: string, retailerId: string) {
    if (!STRIPE_CLIENT_ID) {
      throw new Error("STRIPE_CLIENT_ID environment variable is not set. OAuth flow requires STRIPE_CLIENT_ID. For demo/testing, use manual account linking instead.");
    }

    const tokenResponse = await this.stripe.oauth.token({
      grant_type: "authorization_code",
      code,
    });

    const accountId = tokenResponse.stripe_user_id;
    if (!accountId) {
      throw new Error("Failed to retrieve Stripe account id from OAuth token");
    }

    const account = await this.stripe.accounts.retrieve(accountId);

    await pool.query(
      `INSERT INTO stripe_connect_accounts (retailer_id, stripe_account_id, onboarding_completed, charges_enabled, payouts_enabled, details_submitted)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (retailer_id)
       DO UPDATE SET stripe_account_id = $2, onboarding_completed = $3, charges_enabled = $4, payouts_enabled = $5, details_submitted = $6, updated_at = CURRENT_TIMESTAMP`,
      [
        retailerId,
        accountId,
        account.details_submitted || false,
        account.charges_enabled,
        account.payouts_enabled,
        account.details_submitted || false,
      ]
    );

    return account;
  }

  /**
   * Manually link a Stripe Connect account ID (for test accounts/demo purposes)
   * Validates that the account exists and is a Connect account
   * Optionally accepts a retailer-specific secret key
   */
  async linkStripeAccountManually(
    retailerId: string, 
    accountId: string, 
    secretKey?: string
  ): Promise<Stripe.Account> {
    try {
      // Validate account ID format (should start with acct_)
      if (!accountId.startsWith('acct_')) {
        throw new Error('Invalid Stripe account ID format. Must start with "acct_"');
      }

      // Validate secret key format if provided
      if (secretKey && !secretKey.startsWith('sk_')) {
        throw new Error('Invalid Stripe secret key format. Must start with "sk_"');
      }

      // Check if account already exists for another retailer
      const existingCheck = await pool.query(
        "SELECT retailer_id FROM stripe_connect_accounts WHERE stripe_account_id = $1 AND retailer_id != $2",
        [accountId, retailerId]
      );

      if (existingCheck.rows.length > 0) {
        throw new Error('This Stripe account is already linked to another retailer');
      }

      // Use retailer's secret key if provided, otherwise use platform key
      const stripeInstance = secretKey 
        ? new Stripe(secretKey, { apiVersion: "2025-12-15.clover" })
        : this.stripe;

      // Retrieve and validate the account from Stripe
      const account = await stripeInstance.accounts.retrieve(accountId);

      // Verify it's a Connect account (not the platform account)
      if (account.type !== 'express' && account.type !== 'standard' && account.type !== 'custom') {
        throw new Error('Invalid account type. Only Stripe Connect accounts (express, standard, or custom) can be linked.');
      }

      // Check if this retailer already has an account linked
      const existingRetailerAccount = await pool.query(
        "SELECT stripe_account_id FROM stripe_connect_accounts WHERE retailer_id = $1",
        [retailerId]
      );

      if (existingRetailerAccount.rows.length > 0) {
        // Update existing record
        await pool.query(
          `UPDATE stripe_connect_accounts 
           SET stripe_account_id = $1, 
               stripe_secret_key = $2,
               onboarding_completed = $3, 
               charges_enabled = $4, 
               payouts_enabled = $5, 
               details_submitted = $6, 
               updated_at = CURRENT_TIMESTAMP
           WHERE retailer_id = $7`,
          [
            accountId,
            secretKey || null,
            account.details_submitted || false,
            account.charges_enabled,
            account.payouts_enabled,
            account.details_submitted || false,
            retailerId,
          ]
        );
      } else {
        // Insert new record
        await pool.query(
          `INSERT INTO stripe_connect_accounts (retailer_id, stripe_account_id, stripe_secret_key, onboarding_completed, charges_enabled, payouts_enabled, details_submitted)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            retailerId,
            accountId,
            secretKey || null,
            account.details_submitted || false,
            account.charges_enabled,
            account.payouts_enabled,
            account.details_submitted || false,
          ]
        );
      }

      return account;
    } catch (error: any) {
      console.error("[Stripe] Failed to link account manually:", error);
      throw error;
    }
  }

  async createAccountLink(accountId: string, returnUrl: string, refreshUrl: string) {
    try {
      const platformAccount = await this.getPlatformAccount();
      if (accountId === platformAccount.id) {
        throw new Error("No onboarding required for existing platform Stripe account");
      }

      const accountLink = await this.stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      });

      return accountLink;
    } catch (error: any) {
      console.error("[Stripe] Failed to create account link:", error);
      throw error;
    }
  }

  /**
   * Create a payout from a retailer's connected Stripe account
   * Since we use destination charges, money is already in the connected account
   * We create a payout FROM the connected account (not a transfer TO it)
   * 
   * @param params.retailerId - The retailer's ID (used to look up their Stripe account ID)
   * @param params.amountBase - Amount in base currency (e.g., 10.50 for £10.50)
   * 
   * Note: With destination charges, payments go directly to the connected account.
   * For payouts, we create a payout FROM the connected account using the connected account's credentials.
   * If the retailer has their own secret key, we use it. Otherwise, we use the platform key
   * but specify the connected account ID.
   */
  async createPayoutFromConnectedAccount(params: {
    retailerId: string;
    amountBase: number;
    currency?: string;
    metadata?: Record<string, string>;
  }) {
    const currency = (params.currency || BASE_CURRENCY).toLowerCase();
    if (params.amountBase <= 0) {
      throw new Error("Payout amount must be greater than zero");
    }

    // Get THIS retailer's specific Stripe account ID from the database
    const accountResult = await pool.query(
      "SELECT stripe_account_id, payouts_enabled, stripe_secret_key FROM stripe_connect_accounts WHERE retailer_id = $1",
      [params.retailerId]
    );

    if (accountResult.rows.length === 0) {
      throw new Error("Stripe account not connected for this retailer");
    }

    // Each retailer has their own account ID
    const stripeAccountId = accountResult.rows[0].stripe_account_id;
    const payoutsEnabled = accountResult.rows[0].payouts_enabled;
    const retailerSecretKey = accountResult.rows[0].stripe_secret_key;

    // Log connected Stripe account info
    console.log("[Stripe Payout] Connected Account Info:", {
      retailerId: params.retailerId,
      stripeAccountId: stripeAccountId,
      payoutsEnabled: payoutsEnabled,
      hasRetailerSecretKey: !!retailerSecretKey,
      secretKeyPrefix: retailerSecretKey ? retailerSecretKey.substring(0, 12) + "..." : "none",
      amount: params.amountBase,
      currency: currency,
      amountInMinor: Math.round(params.amountBase * 100),
    });

    if (!stripeAccountId || payoutsEnabled === false) {
      throw new Error("Stripe payouts are not enabled for this retailer");
    }

    const amountInMinor = Math.round(params.amountBase * 100);

    // Use retailer's secret key if available, otherwise use platform key
    // When using platform key, we need to specify the connected account
    let stripeInstance: Stripe;
    
    if (retailerSecretKey) {
      // Use retailer's own Stripe instance
      console.log("[Stripe Payout] Using retailer's secret key to create payout");
      stripeInstance = new Stripe(retailerSecretKey, { apiVersion: "2025-12-15.clover" });
      
      // CRITICAL: Verify that the secret key belongs to the connected account BEFORE retrieving balance
      // When using a secret key, balance.retrieve() returns the balance of the account associated with that key.
      // If the stored secret key is actually the platform's key (wrong), it will return platform balance (WRONG!)
      // We MUST verify the key belongs to the connected account first.
      try {
        const accountFromKey = await stripeInstance.accounts.retrieve();
        const accountIdFromKey = accountFromKey.id;
        
        console.log("[Stripe Payout] Account Verification:", {
          expectedAccountId: stripeAccountId,
          actualAccountIdFromKey: accountIdFromKey,
          accountsMatch: accountIdFromKey === stripeAccountId,
        });
        
        if (accountIdFromKey !== stripeAccountId) {
          console.error("[Stripe Payout] ERROR: Retailer secret key does not match connected account ID!", {
            expected: stripeAccountId,
            actual: accountIdFromKey,
            issue: "This key belongs to a different account. balance.retrieve() would return the wrong account balance.",
          });
          throw new Error(`Secret key belongs to account ${accountIdFromKey}, but connected account is ${stripeAccountId}. This would retrieve the wrong account balance. Please use the correct secret key for the connected account (${stripeAccountId}).`);
        }
        
        // Now retrieve balance - this will be for the correct account (verified above)
        const balance = await stripeInstance.balance.retrieve();
        console.log("[Stripe Payout] Connected Account Balance Info (using retailer's key):", {
          accountId: stripeAccountId,
          verifiedAccountId: accountIdFromKey,
          available: balance.available.map(b => ({ amount: b.amount, currency: b.currency })),
          pending: balance.pending.map(b => ({ amount: b.amount, currency: b.currency })),
          requestedAmount: amountInMinor,
          requestedCurrency: currency,
        });
        
        // Check if there's enough available balance in the requested currency
        const availableBalance = balance.available.find(b => b.currency === currency);
        if (availableBalance) {
          const availableAmount = availableBalance.amount / 100;
          const requestedAmount = amountInMinor / 100;
          
          if (availableBalance.amount < 0) {
            // Negative balance means account is in debt
            throw new Error(`Account has negative balance: ${availableAmount} ${currency.toUpperCase()}. Cannot create payout. Please add funds to your Stripe account to cover the negative balance first. Requested: ${requestedAmount} ${currency.toUpperCase()}.`);
          } else if (availableBalance.amount < amountInMinor) {
            throw new Error(`Insufficient available balance. Available: ${availableAmount} ${currency.toUpperCase()}, Requested: ${requestedAmount} ${currency.toUpperCase()}. Pending balance may not be available for immediate payout.`);
          }
        } else {
          // No balance in requested currency
          const allCurrencies = balance.available.map(b => `${(b.amount / 100).toFixed(2)} ${b.currency.toUpperCase()}`).join(', ');
          throw new Error(`No available balance in ${currency.toUpperCase()}. Available balances: ${allCurrencies || 'none'}. Requested: ${(amountInMinor / 100).toFixed(2)} ${currency.toUpperCase()}.`);
        }
      } catch (balanceError: any) {
        // If balance check fails, log but continue (might be permission issue)
        console.warn("[Stripe Payout] Could not retrieve balance:", balanceError.message);
      }
      
      // Create payout directly from connected account
      const payout = await stripeInstance.payouts.create({
        amount: amountInMinor,
        currency,
        description: "Retailer payout",
        metadata: params.metadata,
      });
      
      console.log("[Stripe Payout] Payout created successfully FROM CONNECTED ACCOUNT:", {
        payoutId: payout.id,
        status: payout.status,
        amount: payout.amount,
        currency: payout.currency,
        destination: payout.destination,
        connectedAccountId: stripeAccountId,
        accountUsed: "connected_account", // Explicitly mark which account was used
      });
      
      return { id: payout.id, type: 'payout', status: payout.status };
    } else if (STRIPE_SECRET_KEY) {
      // Use platform key but create payout on behalf of connected account
      // Note: This requires the platform to have permission to create payouts for connected accounts
      // In some Stripe Connect setups, you may need to use transfers instead
      
      console.log("[Stripe Payout] Using platform key to create payout on behalf of connected account");
      console.log("[Stripe Payout] Platform Account Info:", {
        hasPlatformKey: !!STRIPE_SECRET_KEY,
        platformKeyPrefix: STRIPE_SECRET_KEY ? STRIPE_SECRET_KEY.substring(0, 12) + "..." : "none",
        connectedAccountId: stripeAccountId,
      });
      
      // Try to create payout on behalf of connected account
      try {
        // Check account balance before creating payout (if possible)
        try {
          const balance = await this.stripe.balance.retrieve({
            stripeAccount: stripeAccountId,
          });
          console.log("[Stripe Payout] Connected Account Balance Info:", {
            available: balance.available.map(b => ({ amount: b.amount, currency: b.currency })),
            pending: balance.pending.map(b => ({ amount: b.amount, currency: b.currency })),
            requestedAmount: amountInMinor,
            requestedCurrency: currency,
            connectedAccountId: stripeAccountId,
          });
          
          // Check if there's enough available balance in the requested currency
          const availableBalance = balance.available.find(b => b.currency === currency);
          if (availableBalance) {
            const availableAmount = availableBalance.amount / 100;
            const requestedAmount = amountInMinor / 100;
            
            if (availableBalance.amount < 0) {
              // Negative balance means account is in debt
              throw new Error(`Account has negative balance: ${availableAmount} ${currency.toUpperCase()}. Cannot create payout. Please add funds to your Stripe account to cover the negative balance first. Requested: ${requestedAmount} ${currency.toUpperCase()}.`);
            } else if (availableBalance.amount < amountInMinor) {
              throw new Error(`Insufficient available balance. Available: ${availableAmount} ${currency.toUpperCase()}, Requested: ${requestedAmount} ${currency.toUpperCase()}. Pending balance may not be available for immediate payout.`);
            }
          } else {
            // No balance in requested currency
            const allCurrencies = balance.available.map(b => `${(b.amount / 100).toFixed(2)} ${b.currency.toUpperCase()}`).join(', ');
            throw new Error(`No available balance in ${currency.toUpperCase()}. Available balances: ${allCurrencies || 'none'}. Requested: ${(amountInMinor / 100).toFixed(2)} ${currency.toUpperCase()}.`);
          }
        } catch (balanceError: any) {
          // If balance check fails, log but continue (might be permission issue)
          console.warn("[Stripe Payout] Could not retrieve balance for connected account:", balanceError.message);
        }
        
        const payout = await this.stripe.payouts.create(
          {
            amount: amountInMinor,
            currency,
            description: "Retailer payout",
            metadata: params.metadata,
          },
          {
            stripeAccount: stripeAccountId, // Create payout on behalf of connected account
          }
        );
        
        console.log("[Stripe Payout] Payout created successfully FROM CONNECTED ACCOUNT (using platform key):", {
          payoutId: payout.id,
          status: payout.status,
          amount: payout.amount,
          currency: payout.currency,
          destination: payout.destination,
          connectedAccountId: stripeAccountId,
          accountUsed: "connected_account_via_platform_key", // Explicitly mark which account was used
        });
        
        return { id: payout.id, type: 'payout', status: payout.status };
      } catch (error: any) {
        console.error("[Stripe Payout] Failed to create payout on behalf of connected account:", {
          error: error.message,
          errorType: error.type,
          errorCode: error.code,
          errorDeclineCode: error.decline_code,
          errorParam: error.param,
          connectedAccountId: stripeAccountId,
          amount: amountInMinor,
          currency: currency,
        });
        
        // Provide more specific error messages based on error type
        if (error.code === 'insufficient_funds' || error.message?.includes('insufficient')) {
          throw new Error(`Insufficient available balance in connected account. Available balance may be less than requested amount, or funds may be pending/held. Please check your Stripe dashboard for account ${stripeAccountId}. Original error: ${error.message}`);
        }
        
        // If creating payout on behalf of connected account fails,
        // the money is already in the connected account from destination charges
        // We can't create payouts on behalf of connected accounts without special permissions
        // So we'll just record the payout request and the retailer can withdraw from Stripe directly
        throw new Error(`Cannot create payout automatically. Money is already in your connected Stripe account (${stripeAccountId}). You can withdraw it directly from your Stripe dashboard. Error: ${error.message}`);
      }
    } else {
      console.error("[Stripe Payout] No Stripe credentials available:", {
        retailerId: params.retailerId,
        hasRetailerKey: !!retailerSecretKey,
        hasPlatformKey: !!STRIPE_SECRET_KEY,
      });
      throw new Error("Either retailer secret key or platform Stripe secret key is required for payouts");
    }
  }

  /**
   * @deprecated Use createPayoutFromConnectedAccount instead
   * This method is kept for backward compatibility but should not be used for destination charge setups
   */
  async createTransferToConnectedAccount(params: {
    retailerId: string;
    amountBase: number;
    currency?: string;
    metadata?: Record<string, string>;
  }) {
    // For backward compatibility, delegate to createPayoutFromConnectedAccount
    return this.createPayoutFromConnectedAccount(params);
  }

  /**
   * Create a checkout session for an order
   * Payment goes to THIS retailer's specific Stripe account, not the platform account
   * 
   * @param retailerId - Used to look up the retailer's specific Stripe account ID
   * 
   * Note: The platform takes a commission (application_fee), but the payment
   * destination is the retailer's own Stripe account (stripeAccountId).
   */
  async createCheckoutSession(
    orderId: string,
    retailerId: string,
    amount: number,
    currency: string = "gbp",
    successUrl: string,
    cancelUrl: string,
    customerEmail?: string
  ) {
    try {
      // Get THIS retailer's specific Stripe account ID
      const accountResult = await pool.query(
        "SELECT stripe_account_id, charges_enabled FROM stripe_connect_accounts WHERE retailer_id = $1",
        [retailerId]
      );

      if (accountResult.rows.length === 0) {
        throw new Error("Retailer Stripe account not found");
      }

      // Each retailer has their own account ID
      const stripeAccountId = accountResult.rows[0].stripe_account_id;
      const chargesEnabled = accountResult.rows[0].charges_enabled;

      if (!chargesEnabled) {
        throw new Error("Retailer Stripe account is not ready to accept payments");
      }

      const commissionRate = await this.getCommissionRateForRetailer(retailerId);
      const platformCommission = amount * commissionRate;
      const retailerAmount = amount - platformCommission;

      // Payment goes to THIS retailer's specific account
      // IMPORTANT: Use the platform Stripe instance to create the PaymentIntent so
      // webhooks arrive on the platform account. Funds still flow to the retailer
      // via transfer_data.destination.
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: currency.toLowerCase(),
              product_data: {
                name: `Order ${orderId}`,
                description: `Payment for order ${orderId}`,
              },
              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: customerEmail,
        payment_intent_data: {
          application_fee_amount: Math.round(platformCommission * 100), // Platform commission
          transfer_data: {
            destination: stripeAccountId, // <-- Payment goes to THIS retailer's account, not platform
          },
          metadata: {
            order_id: orderId,
            retailer_id: retailerId,
          },
        },
        metadata: {
          order_id: orderId,
          retailer_id: retailerId,
        },
        automatic_tax: {
          enabled: false,
        },
      });

      return session;
    } catch (error: any) {
      console.error("[Stripe] Failed to create checkout session:", error);
      throw error;
    }
  }

  /**
   * Create Payment Intent for mobile app (native Stripe checkout)
   */
  async createPaymentIntent(
    orderId: string,
    retailerId: string,
    amount: number,
    currency: string = "gbp",
    customerEmail?: string
  ) {
    try {
      const accountResult = await pool.query(
        "SELECT stripe_account_id, charges_enabled FROM stripe_connect_accounts WHERE retailer_id = $1",
        [retailerId]
      );

      if (accountResult.rows.length === 0) {
        throw new Error("Retailer Stripe account not found");
      }

      const stripeAccountId = accountResult.rows[0].stripe_account_id;
      const chargesEnabled = accountResult.rows[0].charges_enabled;

      if (!chargesEnabled) {
        throw new Error("Retailer Stripe account is not ready to accept payments");
      }

      const commissionRate = await this.getCommissionRateForRetailer(retailerId);
      const platformCommission = amount * commissionRate;

      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: currency.toLowerCase(),
        application_fee_amount: Math.round(platformCommission * 100),
        transfer_data: {
          destination: stripeAccountId,
        },
        metadata: {
          order_id: orderId,
          retailer_id: retailerId,
        },
        receipt_email: customerEmail,
        automatic_payment_methods: {
          enabled: true,
        },
      });

      return paymentIntent;
    } catch (error: any) {
      console.error("[Stripe] Failed to create payment intent:", error);
      throw error;
    }
  }

  async handleWebhook(event: Stripe.Event) {
    try {
      switch (event.type) {
        case "checkout.session.completed":
          const session = event.data.object as Stripe.Checkout.Session;
          await this.handleCheckoutCompleted(session);
          break;

        case "payment_intent.succeeded":
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          await this.handlePaymentSucceeded(paymentIntent);
          break;

        case "account.updated":
          const account = event.data.object as Stripe.Account;
          await this.handleAccountUpdated(account);
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }
    } catch (error: any) {
      console.error("[Stripe] Webhook error:", error);
      throw error;
    }
  }

  constructWebhookEvent(payload: string | Buffer, signature: string, secret: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const orderId = session.metadata?.order_id;
    if (!orderId) return;

    await pool.query(
      `UPDATE orders 
       SET status = 'processing', 
           stripe_session_id = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [session.id, orderId]
    );
  }

  private async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    const orderId = paymentIntent.metadata?.order_id;
    const retailerId = paymentIntent.metadata?.retailer_id;
    
    if (!orderId || !retailerId) {
      console.error(`[Stripe] Missing order_id or retailer_id in payment intent metadata`);
      return;
    }

    const commissionRate = await this.getCommissionRateForRetailer(retailerId);
    const totalAmount = paymentIntent.amount / 100;
    const platformCommission = totalAmount * commissionRate;
    const retailerAmount = totalAmount - platformCommission;

    // Get order details - must be in 'awaiting_payment' status
    const orderResult = await pool.query(
      `SELECT user_id, total, status, points_used, discount_amount 
       FROM orders WHERE id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      console.error(`[Stripe] Order ${orderId} not found when processing payment`);
      return;
    }

    const order = orderResult.rows[0];
    const userId = order.user_id;
    const orderTotal = parseFloat(order.total);

    // Only process orders that are awaiting payment
    if (order.status !== 'awaiting_payment') {
      console.log(`[Stripe] Order ${orderId} is not in 'awaiting_payment' status (current: ${order.status}). Skipping finalization.`);
      // Still update payment info but don't finalize
      await pool.query(
        `UPDATE orders 
         SET stripe_payment_intent_id = $1,
             platform_commission = $2,
             retailer_amount = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [paymentIntent.id, platformCommission, retailerAmount, orderId]
      );
      return;
    }

    console.log(`[Stripe] Finalizing order ${orderId} after payment confirmation`);

    // FINALIZE ORDER: Update status to 'processing' and payment info
    await pool.query(
      `UPDATE orders 
       SET stripe_payment_intent_id = $1,
           platform_commission = $2,
           retailer_amount = $3,
           status = 'processing',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [paymentIntent.id, platformCommission, retailerAmount, orderId]
    );

    if (paymentIntent.transfer_data?.destination) {
      await pool.query(
        `UPDATE orders SET stripe_transfer_id = $1 WHERE id = $2`,
        [paymentIntent.transfer_data.destination, orderId]
      );
    }

    // NOW deduct stock for products (this was deferred until payment succeeded)
    const orderItemsResult = await pool.query(
      `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
      [orderId]
    );

    for (const item of orderItemsResult.rows) {
      await pool.query(
        `UPDATE products SET stock = stock - $1 WHERE id = $2`,
        [item.quantity, item.product_id]
      );
      console.log(`[Stripe] Deducted ${item.quantity} units from product ${item.product_id}`);
    }

    // NOW clear cart (this was deferred until payment succeeded)
    await pool.query(
      `DELETE FROM cart_items WHERE user_id = $1`,
      [userId]
    );
    await pool.query(
      `DELETE FROM cart_service_items WHERE user_id = $1`,
      [userId]
    );
    console.log(`[Stripe] Cleared cart for user ${userId}`);

    // NOW redeem points if they were specified (this was deferred until payment succeeded)
    if (order.points_used && parseFloat(order.points_used) > 0) {
      try {
        await rewardsService.redeemPoints(userId, orderId, parseFloat(order.points_used));
        console.log(`[Stripe] Redeemed ${order.points_used} points for order ${orderId}`);
      } catch (error: any) {
        console.error(`[Stripe] Failed to redeem points for order ${orderId}:`, error);
        // Don't throw - points redemption failure shouldn't fail the order
      }
    }

    // Award cashback points (1% of total order amount)
    try {
      await rewardsService.awardCashback(userId, orderId, orderTotal);
      console.log(`[Stripe] Awarded cashback for order ${orderId}`);
    } catch (error: any) {
      console.error(`[Stripe] Failed to award cashback for order ${orderId}:`, error);
      // Don't throw - cashback is a bonus feature
    }

    console.log(`[Stripe] Order ${orderId} finalized successfully`);
  }

  private async handleAccountUpdated(account: Stripe.Account) {
    await pool.query(
      `UPDATE stripe_connect_accounts 
       SET onboarding_completed = $1,
           charges_enabled = $2,
           payouts_enabled = $3,
           details_submitted = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE stripe_account_id = $5`,
      [
        account.details_submitted || false,
        account.charges_enabled,
        account.payouts_enabled,
        account.details_submitted || false,
        account.id,
      ]
    );
  }

  async getAccountStatus(retailerId: string) {
    try {
      const result = await pool.query(
        "SELECT * FROM stripe_connect_accounts WHERE retailer_id = $1",
        [retailerId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const account = result.rows[0];

      if (account.stripe_account_id) {
        // Use retailer's secret key if available, otherwise use platform key
        const stripeInstance = account.stripe_secret_key
          ? new Stripe(account.stripe_secret_key, { apiVersion: "2025-12-15.clover" })
          : this.stripe;
        
        try {
          const stripeAccount = await stripeInstance.accounts.retrieve(account.stripe_account_id);
          return {
            ...account,
            charges_enabled: stripeAccount.charges_enabled,
            payouts_enabled: stripeAccount.payouts_enabled,
            details_submitted: stripeAccount.details_submitted,
          };
        } catch (error: any) {
          // If account retrieval fails, return the stored status
          console.error(`[Stripe] Failed to retrieve account ${account.stripe_account_id}:`, error.message);
          return {
            ...account,
            // Keep the stored values if we can't retrieve fresh ones
          };
        }
      }

      return account;
    } catch (error: any) {
      console.error("[Stripe] Failed to get account status:", error);
      throw error;
    }
  }
}

export const stripeService = new StripeService();
export default stripeService;
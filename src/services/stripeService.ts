import Stripe from "stripe";
import { pool } from "../db/connection";
import { rewardsService } from "./rewardsService";

/**
 * Stripe Connect Architecture:
 * 
 * Platform Credentials (optional, for backward compatibility):
 * - STRIPE_SECRET_KEY: Platform's secret key (fallback if business doesn't provide their own)
 * - STRIPE_CLIENT_ID: Platform's OAuth client ID (used to generate OAuth URLs)
 * 
 * Business Accounts (each business has their own):
 * - Each business connects their own Stripe Connect account via OAuth or manual linking
 * - Each business's account ID (acct_xxx) is stored in stripe_connect_accounts table
 * - Each business can optionally provide their own secret key (stripe_secret_key)
 * - When making API calls:
 *   - If business has their own secret key: use business's key
 *   - Otherwise: use platform key (if available) and specify the business's account ID
 * 
 * Example:
 * - Business A has account: acct_1234567890, secret key: sk_test_abc123
 * - Business B has account: acct_0987654321, no secret key (uses platform key)
 * - Each business's payments go to their own account
 */

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || "";
const STRIPE_PLATFORM_ACCOUNT_ID = process.env.STRIPE_PLATFORM_ACCOUNT_ID || "";
const STRIPE_CLIENT_ID = process.env.STRIPE_CLIENT_ID || "";
const DEFAULT_COMMISSION_RATE = parseFloat(process.env.PLATFORM_COMMISSION_RATE || "0.10");
const BASE_CURRENCY = (process.env.BASE_CURRENCY || "GBP").toLowerCase();

/**
 * Commission Tier Configuration
 * Based on 30-day rolling turnover (can be changed to calendar month)
 * 
 * Tiers:
 * - Starter: 0-£5k turnover → 9% commission
 * - Growth: £5k-£10k turnover → 8% commission
 * - Momentum: £10k-£50k turnover → 7% commission
 * - Elite: £50k+ turnover → 6% commission
 */
export interface CommissionTier {
  name: string;
  minTurnover: number; // GBP
  maxTurnover: number | null; // null means unlimited
  commissionRate: number; // 0.09 = 9%
}

export const COMMISSION_TIERS: CommissionTier[] = [
  { name: "Starter", minTurnover: 0, maxTurnover: 5000, commissionRate: 0.09 },      // 9%
  { name: "Growth", minTurnover: 5000, maxTurnover: 10000, commissionRate: 0.08 },    // 8%
  { name: "Momentum", minTurnover: 10000, maxTurnover: 25000, commissionRate: 0.07 }, // 7%
  { name: "Elite", minTurnover: 25000, maxTurnover: null, commissionRate: 0.06 },    // 6%
];

// Use 30-day rolling period (can be changed to calendar month)
const TURNOVER_PERIOD_DAYS = 30;

export class StripeService {
  private stripe: Stripe;
  private platformAccountId?: string;

  constructor() {
    // Validate Stripe configuration
    if (!STRIPE_SECRET_KEY) {
      console.error("[Stripe] ⚠️ STRIPE_SECRET_KEY is not set. Stripe features will not work.");
      throw new Error("STRIPE_SECRET_KEY environment variable is required");
    }

    if (!STRIPE_SECRET_KEY.startsWith('sk_')) {
      console.error("[Stripe] ⚠️ Invalid STRIPE_SECRET_KEY format. Must start with 'sk_'");
      throw new Error("Invalid STRIPE_SECRET_KEY format");
    }

    // Initialize Stripe with platform key
    this.stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2025-12-15.clover",
    });

    // Log key type (test vs live) for security awareness
    const keyType = STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST';
    console.log(`[Stripe] Initialized with ${keyType} key (${STRIPE_SECRET_KEY.substring(0, 12)}...)`);
  }

  /**
   * Verify Stripe account connection (for startup validation)
   */
  async verifyConnection(): Promise<boolean> {
    try {
      const account = await this.stripe.accounts.retrieve();
      console.log(`[Stripe] ✅ Connection verified. Account: ${account.id} (${account.type})`);
      return true;
    } catch (error: any) {
      console.error("[Stripe] ❌ Connection verification failed:", error.message);
      return false;
    }
  }

  /**
   * Get a Stripe instance for a specific business
   * Uses business's own secret key if available, otherwise falls back to platform key
   */
  private async getStripeInstanceForBusiness(businessId: string): Promise<Stripe> {
    try {
      const result = await pool.query(
        "SELECT stripe_secret_key FROM stripe_connect_accounts WHERE business_id = $1",
        [businessId]
      );

      // If business has their own secret key, use it
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

      throw new Error("No Stripe secret key configured for this business and no platform key available");
    } catch (error: any) {
      console.error("[Stripe] Failed to get Stripe instance for business:", error);
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

  /**
   * Calculate 30-day rolling turnover for a business
   * @param businessId - The business ID
   * @returns Turnover in GBP for the last 30 days
   */
  private async calculateBusinessTurnover(businessId: string): Promise<number> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - TURNOVER_PERIOD_DAYS);

      const result = await pool.query(
        `SELECT COALESCE(SUM(total), 0) as turnover
         FROM orders
         WHERE business_id = $1
           AND status IN ('processing', 'ready_for_pickup', 'completed', 'collected')
           AND created_at >= $2`,
        [businessId, thirtyDaysAgo]
      );

      const turnover = parseFloat(result.rows[0]?.turnover || "0");
      return turnover;
    } catch (error: any) {
      console.error(`[Stripe] Failed to calculate turnover for business ${businessId}:`, error?.message);
      return 0;
    }
  }

  /**
   * Get commission tier for a business based on turnover
   * @param businessId - The business ID
   * @returns Commission tier information
   */
  async getCommissionTierForBusiness(businessId: string): Promise<{ tier: CommissionTier; turnover: number }> {
    const turnover = await this.calculateBusinessTurnover(businessId);
    
    // Find the appropriate tier based on turnover
    for (let i = COMMISSION_TIERS.length - 1; i >= 0; i--) {
      const tier = COMMISSION_TIERS[i];
      if (turnover >= tier.minTurnover && (tier.maxTurnover === null || turnover < tier.maxTurnover)) {
        return { tier, turnover };
      }
    }
    
    // Fallback to Starter tier if no match (shouldn't happen)
    return { tier: COMMISSION_TIERS[0], turnover };
  }

  /**
   * Get commission rate for a business
   * Priority:
   * 1. Trial period (0% commission)
   * 2. Business-specific override
   * 3. Tier-based commission (based on turnover)
   * 4. Platform default
   */
  private async getCommissionRateForBusiness(businessId: string): Promise<number> {
    try {
      // First, check if business is in trial period
      const businessResult = await pool.query(
        `SELECT commission_rate_override, trial_ends_at, billing_status 
         FROM businesses WHERE id = $1`,
        [businessId]
      );

      if (businessResult.rows.length > 0) {
        const business = businessResult.rows[0];
        const now = new Date();
        const trialEndsAt = business.trial_ends_at ? new Date(business.trial_ends_at) : null;

        // If in trial period, return 0% commission
        if (trialEndsAt && trialEndsAt > now) {
          console.log(`[Stripe] Business ${businessId} is in trial period (ends ${trialEndsAt.toISOString()}), using 0% commission`);
          return 0;
        }

        // Check for business-specific commission override (takes priority over tier)
        if (business.commission_rate_override !== null && business.commission_rate_override !== undefined) {
          const overrideRate = parseFloat(business.commission_rate_override);
          if (!isNaN(overrideRate) && overrideRate >= 0 && overrideRate <= 1) {
            console.log(`[Stripe] Using business-specific commission rate ${overrideRate} for business ${businessId}`);
            return overrideRate;
          }
        }
      }

      // Use tier-based commission based on turnover
      const { tier, turnover } = await this.getCommissionTierForBusiness(businessId);
      console.log(`[Stripe] Business ${businessId} is in ${tier.name} tier (turnover: £${turnover.toFixed(2)}, rate: ${(tier.commissionRate * 100).toFixed(1)}%)`);
      return tier.commissionRate;
    } catch (error: any) {
      console.error("[Stripe] Failed to fetch commission rate from database, using default:", error?.message);
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
    }
  }

  async createConnectAccount(businessId: string, email: string, businessName: string) {
    try {
      const existing = await pool.query(
        "SELECT stripe_account_id FROM stripe_connect_accounts WHERE business_id = $1",
        [businessId]
      );
      if (existing.rows.length > 0) {
        const existingAccountId = existing.rows[0].stripe_account_id;
        const existingAccount = await this.stripe.accounts.retrieve(existingAccountId);
        return existingAccount;
      }

      const account = await this.getPlatformAccount();

      await pool.query(
        `INSERT INTO stripe_connect_accounts (business_id, stripe_account_id, onboarding_completed, charges_enabled, payouts_enabled)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (business_id) 
         DO UPDATE SET stripe_account_id = $2, updated_at = CURRENT_TIMESTAMP`,
        [
          businessId,
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

  /**
   * Create a new Express connected account for a business
   * This is the CORRECT way for marketplaces (per Stripe docs)
   * Replaces the incorrect OAuth flow for new accounts
   * 
   * @param businessId - The business's ID in our database
   * @param email - The business owner's email
   * @param country - ISO country code (default: 'GB' for UK)
   */
  async createExpressAccount(businessId: string, email: string, country: string = 'GB') {
    try {
      // Check if account already exists
      const existing = await pool.query(
        "SELECT stripe_account_id FROM stripe_connect_accounts WHERE business_id = $1",
        [businessId]
      );
      
      if (existing.rows.length > 0) {
        const accountId = existing.rows[0].stripe_account_id;
        console.log(`[Stripe] Express account already exists for business ${businessId}: ${accountId}`);
        return await this.stripe.accounts.retrieve(accountId);
      }

      console.log(`[Stripe] Creating new Express account for business ${businessId} (${email}, ${country})`);

      // Create Express account via Stripe API
      // This is the official Stripe-recommended approach for marketplaces
      const account = await this.stripe.accounts.create({
        type: 'express',
        country: country,
        email: email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        // ⚠️ CRITICAL: Set dashboard to express (creates Express Dashboard automatically)
        // This enables businesses to access their dashboard via login links
        metadata: {
          business_id: businessId,
          platform: 'localito',
        },
        settings: {
          payouts: {
            schedule: {
              interval: 'daily', // Daily payouts (instant when available)
            },
          },
        },
      });

      console.log(`[Stripe] Express account created: ${account.id}`);

      // Store in database
      await pool.query(
        `INSERT INTO stripe_connect_accounts (
          business_id, 
          stripe_account_id, 
          onboarding_completed, 
          charges_enabled, 
          payouts_enabled,
          details_submitted
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (business_id) 
        DO UPDATE SET 
          stripe_account_id = $2, 
          onboarding_completed = $3,
          charges_enabled = $4,
          payouts_enabled = $5,
          details_submitted = $6,
          updated_at = CURRENT_TIMESTAMP`,
        [
          businessId,
          account.id,
          false, // Not onboarded yet
          account.charges_enabled || false,
          account.payouts_enabled || false,
          account.details_submitted || false,
        ]
      );

      return account;
    } catch (error: any) {
      console.error("[Stripe] Failed to create Express account:", {
        businessId,
        email,
        country,
        error: error.message,
        type: error.type,
        code: error.code,
      });
      
      // Provide user-friendly error messages
      if (error.code === 'account_invalid') {
        throw new Error('Invalid account configuration. Please contact support.');
      }
      if (error.code === 'rate_limit') {
        throw new Error('Too many requests. Please try again in a moment.');
      }
      
      throw new Error(`Failed to create Stripe account: ${error.message}`);
    }
  }

  /**
   * @deprecated Use createExpressAccount for new businesses. 
   * This OAuth flow is only for Standard accounts (businesses with existing Stripe accounts).
   */
  getOAuthAuthorizeUrl(opts: {
    businessId: string;
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

  async exchangeOAuthCode(code: string, businessId: string) {
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
      `INSERT INTO stripe_connect_accounts (business_id, stripe_account_id, onboarding_completed, charges_enabled, payouts_enabled, details_submitted)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (business_id)
       DO UPDATE SET stripe_account_id = $2, onboarding_completed = $3, charges_enabled = $4, payouts_enabled = $5, details_submitted = $6, updated_at = CURRENT_TIMESTAMP`,
      [
        businessId,
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
   * Optionally accepts a business-specific secret key
   */
  async linkStripeAccountManually(
    businessId: string, 
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

      // Check if account already exists for another business
      const existingCheck = await pool.query(
        "SELECT business_id FROM stripe_connect_accounts WHERE stripe_account_id = $1 AND business_id != $2",
        [accountId, businessId]
      );

      if (existingCheck.rows.length > 0) {
        throw new Error('This Stripe account is already linked to another business');
      }

      // Use business's secret key if provided, otherwise use platform key
      const stripeInstance = secretKey 
        ? new Stripe(secretKey, { apiVersion: "2025-12-15.clover" })
        : this.stripe;

      // Retrieve and validate the account from Stripe
      const account = await stripeInstance.accounts.retrieve(accountId);

      // Verify it's a Connect account (not the platform account)
      if (account.type !== 'express' && account.type !== 'standard' && account.type !== 'custom') {
        throw new Error('Invalid account type. Only Stripe Connect accounts (express, standard, or custom) can be linked.');
      }

      // Check if this business already has an account linked
      const existingBusinessAccount = await pool.query(
        "SELECT stripe_account_id FROM stripe_connect_accounts WHERE business_id = $1",
        [businessId]
      );

      if (existingBusinessAccount.rows.length > 0) {
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
           WHERE business_id = $7`,
          [
            accountId,
            secretKey || null,
            account.details_submitted || false,
            account.charges_enabled,
            account.payouts_enabled,
            account.details_submitted || false,
            businessId,
          ]
        );
      } else {
        // Insert new record
        await pool.query(
          `INSERT INTO stripe_connect_accounts (business_id, stripe_account_id, stripe_secret_key, onboarding_completed, charges_enabled, payouts_enabled, details_submitted)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            businessId,
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

  /**
   * Create an Account Link for Stripe Connect onboarding
   * This is used for Express accounts to complete their onboarding via Stripe-hosted flow
   * 
   * @param accountId - The Stripe Connect account ID (acct_xxx)
   * @param returnUrl - Where to redirect after successful onboarding
   * @param refreshUrl - Where to redirect if the link expires (user can restart)
   */
  async createAccountLink(accountId: string, returnUrl: string, refreshUrl: string) {
    try {
      // Validate account ID format
      if (!accountId || !accountId.startsWith('acct_')) {
        throw new Error("Invalid account ID format. Must start with 'acct_'");
      }

      console.log(`[Stripe] Creating account link for: ${accountId}`);

      const accountLink = await this.stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding",
        collect: "eventually_due", // Collect all required info upfront
      });

      console.log(`[Stripe] Account link created successfully for: ${accountId}`);
      return accountLink;
    } catch (error: any) {
      console.error("[Stripe] Failed to create account link:", error);
      throw error;
    }
  }

  /**
   * Generate login link for Express Dashboard
   * Businesses use this to access their Stripe Express Dashboard
   * The Express Dashboard is automatically created when using Express accounts
   * 
   * @param accountId - The Stripe Connect account ID (acct_xxx)
   * @returns Login link object with URL that redirects to Express Dashboard
   */
  /**
   * Retrieve Stripe account information by account ID
   * @param accountId - The Stripe Connect account ID (acct_xxx)
   * @returns Stripe account object
   */
  async retrieveAccount(accountId: string): Promise<Stripe.Account> {
    return await this.stripe.accounts.retrieve(accountId);
  }

  async createExpressDashboardLoginLink(accountId: string): Promise<Stripe.LoginLink> {
    try {
      console.log(`[Stripe] Creating Express Dashboard login link for account: ${accountId}`);
      
      // Check account type first before attempting to create login link
      const account = await this.retrieveAccount(accountId);
      
      if (account.type !== 'express') {
        throw new Error(`Login links are only available for Express accounts. This account is of type '${account.type}'. Standard accounts must access their dashboard through the Stripe Dashboard directly.`);
      }
      
      const loginLink = await this.stripe.accounts.createLoginLink(accountId);
      
      console.log(`[Stripe] Login link created successfully for account: ${accountId}`);
      return loginLink;
    } catch (error: any) {
      console.error("[Stripe] Failed to create Express Dashboard login link:", error);
      
      // Provide more specific error messages
      if (error.code === 'account_invalid') {
        throw new Error('Invalid Stripe account. The account may not exist or is not an Express account.');
      }
      if (error.code === 'login_link_not_allowed') {
        throw new Error('Login links are not available for this account type. Only Express accounts support login links.');
      }
      
      throw error;
    }
  }

  /**
   * Create a payout from a business's connected Stripe account
   * Since we use destination charges, money is already in the connected account
   * We create a payout FROM the connected account (not a transfer TO it)
   * 
   * @param params.businessId - The business's ID (used to look up their Stripe account ID)
   * @param params.amountBase - Amount in base currency (e.g., 10.50 for £10.50)
   * 
   * Note: With destination charges, payments go directly to the connected account.
   * For payouts, we create a payout FROM the connected account using the connected account's credentials.
   * If the business has their own secret key, we use it. Otherwise, we use the platform key
   * but specify the connected account ID.
   */
  async createPayoutFromConnectedAccount(params: {
    businessId: string;
    amountBase: number;
    currency?: string;
    metadata?: Record<string, string>;
  }) {
    const currency = (params.currency || BASE_CURRENCY).toLowerCase();
    if (params.amountBase <= 0) {
      throw new Error("Payout amount must be greater than zero");
    }

    // Get THIS business's specific Stripe account ID from the database
    const accountResult = await pool.query(
      "SELECT stripe_account_id, payouts_enabled, stripe_secret_key FROM stripe_connect_accounts WHERE business_id = $1",
      [params.businessId]
    );

    if (accountResult.rows.length === 0) {
      throw new Error("Stripe account not connected for this business");
    }

    // Each business has their own account ID
    const stripeAccountId = accountResult.rows[0].stripe_account_id;
    const payoutsEnabled = accountResult.rows[0].payouts_enabled;
    const businessSecretKey = accountResult.rows[0].stripe_secret_key;

    // Log connected Stripe account info
    console.log("[Stripe Payout] Connected Account Info:", {
      businessId: params.businessId,
      stripeAccountId: stripeAccountId,
      payoutsEnabled: payoutsEnabled,
      hasBusinessSecretKey: !!businessSecretKey,
      secretKeyPrefix: businessSecretKey ? businessSecretKey.substring(0, 12) + "..." : "none",
      amount: params.amountBase,
      currency: currency,
      amountInMinor: Math.round(params.amountBase * 100),
    });

    if (!stripeAccountId || payoutsEnabled === false) {
      throw new Error("Stripe payouts are not enabled for this business");
    }

    const amountInMinor = Math.round(params.amountBase * 100);

    // Use business's secret key if available, otherwise use platform key
    // When using platform key, we need to specify the connected account
    let stripeInstance: Stripe;
    
    if (businessSecretKey) {
      // Use business's own Stripe instance
      console.log("[Stripe Payout] Using business's secret key to create payout");
      stripeInstance = new Stripe(businessSecretKey, { apiVersion: "2025-12-15.clover" });
      
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
          console.error("[Stripe Payout] ERROR: Business secret key does not match connected account ID!", {
            expected: stripeAccountId,
            actual: accountIdFromKey,
            issue: "This key belongs to a different account. balance.retrieve() would return the wrong account balance.",
          });
          throw new Error(`Secret key belongs to account ${accountIdFromKey}, but connected account is ${stripeAccountId}. This would retrieve the wrong account balance. Please use the correct secret key for the connected account (${stripeAccountId}).`);
        }
        
        // Now retrieve balance - this will be for the correct account (verified above)
        const balance = await stripeInstance.balance.retrieve();
        console.log("[Stripe Payout] Connected Account Balance Info (using business's key):", {
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
        description: "Business payout",
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
            description: "Business payout",
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
        // So we'll just record the payout request and the business can withdraw from Stripe directly
        throw new Error(`Cannot create payout automatically. Money is already in your connected Stripe account (${stripeAccountId}). You can withdraw it directly from your Stripe dashboard. Error: ${error.message}`);
      }
    } else {
      console.error("[Stripe Payout] No Stripe credentials available:", {
        businessId: params.businessId,
        hasBusinessKey: !!businessSecretKey,
        hasPlatformKey: !!STRIPE_SECRET_KEY,
      });
      throw new Error("Either business secret key or platform Stripe secret key is required for payouts");
    }
  }

  /**
   * @deprecated Use createPayoutFromConnectedAccount instead
   * This method is kept for backward compatibility but should not be used for destination charge setups
   */
  async createTransferToConnectedAccount(params: {
    businessId: string;
    amountBase: number;
    currency?: string;
    metadata?: Record<string, string>;
  }) {
    // For backward compatibility, delegate to createPayoutFromConnectedAccount
    return this.createPayoutFromConnectedAccount(params);
  }

  /**
   * Create a checkout session for an order
   * Payment goes to THIS business's specific Stripe account, not the platform account
   * 
   * @param businessId - Used to look up the business's specific Stripe account ID
   * 
   * Note: The platform takes a commission (application_fee), but the payment
   * destination is the business's own Stripe account (stripeAccountId).
   */
  async createCheckoutSession(
    orderId: string,
    businessId: string,
    amount: number,
    currency: string = "gbp",
    successUrl: string,
    cancelUrl: string,
    customerEmail?: string
  ) {
    try {
      // Get THIS business's specific Stripe account ID
      const accountResult = await pool.query(
        "SELECT stripe_account_id, charges_enabled FROM stripe_connect_accounts WHERE business_id = $1",
        [businessId]
      );

      if (accountResult.rows.length === 0) {
        throw new Error("Business Stripe account not found");
      }

      // Each business has their own account ID
      const stripeAccountId = accountResult.rows[0].stripe_account_id;
      const chargesEnabled = accountResult.rows[0].charges_enabled;

      if (!chargesEnabled) {
        throw new Error("Business Stripe account is not ready to accept payments");
      }

      const commissionRate = await this.getCommissionRateForBusiness(businessId);
      const platformCommission = amount * commissionRate;
      const businessAmount = amount - platformCommission;

      // Payment goes to THIS business's specific account
      // IMPORTANT: Use the platform Stripe instance to create the PaymentIntent so
      // webhooks arrive on the platform account. Funds still flow to the business
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
            destination: stripeAccountId, // <-- Payment goes to THIS business's account, not platform
          },
          metadata: {
            order_id: orderId,
            business_id: businessId,
          },
        },
        metadata: {
          order_id: orderId,
          business_id: businessId,
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
    businessId: string,
    amount: number,
    currency: string = "gbp",
    customerEmail?: string
  ) {
    try {
      const accountResult = await pool.query(
        "SELECT stripe_account_id, charges_enabled FROM stripe_connect_accounts WHERE business_id = $1",
        [businessId]
      );

      if (accountResult.rows.length === 0) {
        throw new Error("Business Stripe account not found");
      }

      const stripeAccountId = accountResult.rows[0].stripe_account_id;
      const chargesEnabled = accountResult.rows[0].charges_enabled;

      if (!chargesEnabled) {
        throw new Error("Business Stripe account is not ready to accept payments");
      }

      const commissionRate = await this.getCommissionRateForBusiness(businessId);
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
          business_id: businessId,
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

        case "payment_intent.payment_failed":
          const failedPaymentIntent = event.data.object as Stripe.PaymentIntent;
          await this.handlePaymentFailed(failedPaymentIntent);
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
    const businessId = paymentIntent.metadata?.business_id;
    
    if (!orderId || !businessId) {
      console.error(`[Stripe] Missing order_id or business_id in payment intent metadata`);
      return;
    }

    const commissionRate = await this.getCommissionRateForBusiness(businessId);
    const totalAmount = paymentIntent.amount / 100;
    const platformCommission = totalAmount * commissionRate;
    const businessAmount = totalAmount - platformCommission;

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
             business_amount = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [paymentIntent.id, platformCommission, businessAmount, orderId]
      );
      return;
    }

    console.log(`[Stripe] Finalizing order ${orderId} after payment confirmation`);

    // FINALIZE ORDER: Update status to 'processing' and payment info
    await pool.query(
      `UPDATE orders 
       SET stripe_payment_intent_id = $1,
           platform_commission = $2,
           business_amount = $3,
           status = 'processing',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [paymentIntent.id, platformCommission, businessAmount, orderId]
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

  private async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
    const orderId = paymentIntent.metadata?.order_id;
    const businessId = paymentIntent.metadata?.business_id;
    
    if (!orderId) {
      console.error(`[Stripe] Missing order_id in failed payment intent metadata`);
      return;
    }

    console.log(`[Stripe] Payment failed for order ${orderId}`);

    // Update order status to indicate payment failure
    await pool.query(
      `UPDATE orders 
       SET status = 'cancelled',
           stripe_payment_intent_id = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [paymentIntent.id, orderId]
    );

    // Log the failure reason
    const failureCode = paymentIntent.last_payment_error?.code || 'unknown';
    const failureMessage = paymentIntent.last_payment_error?.message || 'Payment failed';
    
    console.log(`[Stripe] Payment failure details for order ${orderId}:`, {
      failureCode,
      failureMessage,
      paymentIntentId: paymentIntent.id,
    });
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

  async getAccountStatus(businessId: string) {
    try {
      const result = await pool.query(
        "SELECT * FROM stripe_connect_accounts WHERE business_id = $1",
        [businessId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const account = result.rows[0];

      if (account.stripe_account_id) {
        // Use business's secret key if available, otherwise use platform key
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
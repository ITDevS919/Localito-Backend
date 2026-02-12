import Stripe from "stripe";
import { pool } from "../db/connection";
import { rewardsService } from "./rewardsService";
import { emailService } from "./emailService";

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
      // Validate amount - Stripe requires minimum amount (50 pence for GBP)
      const minAmount = currency.toLowerCase() === 'gbp' ? 0.50 : 0.50;
      if (amount <= 0) {
        throw new Error("Payment amount must be greater than zero");
      }
      if (amount < minAmount) {
        throw new Error(`Payment amount must be at least £${minAmount.toFixed(2)}`);
      }

      // Get THIS business's specific Stripe account ID
      const accountResult = await pool.query(
        "SELECT stripe_account_id, charges_enabled FROM stripe_connect_accounts WHERE business_id = $1",
        [businessId]
      );

      if (accountResult.rows.length === 0) {
        // This should not happen if auto-creation is working, but provide helpful error
        throw new Error("Business Stripe account not found. Please contact support to set up payment processing.");
      }

      // Each business has their own account ID
      const stripeAccountId = accountResult.rows[0].stripe_account_id;
      const chargesEnabled = accountResult.rows[0].charges_enabled;

      // Fetch order details for user-friendly checkout display
      const orderDetailsResult = await pool.query(
        `SELECT 
          b.business_name,
          COALESCE(
            (SELECT string_agg(p.name, ', ' ORDER BY oi.id)
             FROM order_items oi
             JOIN products p ON oi.product_id = p.id
             WHERE oi.order_id = $1
             LIMIT 3),
            ''
          ) as product_names,
          COALESCE(
            (SELECT string_agg(s.name, ', ' ORDER BY osi.id)
             FROM order_service_items osi
             JOIN services s ON osi.service_id = s.id
             WHERE osi.order_id = $1
             LIMIT 3),
            ''
          ) as service_names,
          (SELECT COUNT(*) FROM order_items WHERE order_id = $1) as product_count,
          (SELECT COUNT(*) FROM order_service_items WHERE order_id = $1) as service_count
         FROM orders o
         JOIN businesses b ON o.business_id = b.id
         WHERE o.id = $1`,
        [orderId]
      );

      // Build user-friendly order name
      let orderName = `Order from ${orderDetailsResult.rows[0]?.business_name || 'Business'}`;
      let orderDescription = `Payment for your order`;
      
      if (orderDetailsResult.rows.length > 0) {
        const orderDetails = orderDetailsResult.rows[0];
        const productNames = orderDetails.product_names || '';
        const serviceNames = orderDetails.service_names || '';
        const productCount = parseInt(orderDetails.product_count || '0');
        const serviceCount = parseInt(orderDetails.service_count || '0');
        
        // Create descriptive name with product/service names
        const itemNames: string[] = [];
        if (productNames) {
          if (productCount > 3) {
            itemNames.push(`${productNames} and ${productCount - 3} more item${productCount - 3 > 1 ? 's' : ''}`);
          } else {
            itemNames.push(productNames);
          }
        }
        if (serviceNames) {
          if (serviceCount > 3) {
            itemNames.push(`${serviceNames} and ${serviceCount - 3} more service${serviceCount - 3 > 1 ? 's' : ''}`);
          } else {
            itemNames.push(serviceNames);
          }
        }
        
        if (itemNames.length > 0) {
          orderName = `Order from ${orderDetails.business_name}: ${itemNames.join(', ')}`;
          orderDescription = `Payment for your order from ${orderDetails.business_name}`;
        }
      }

      const commissionRate = await this.getCommissionRateForBusiness(businessId);
      const platformCommission = amount * commissionRate;
      const businessAmount = amount - platformCommission;

      // If business has charges_enabled, use Destination Charges (direct to business account)
      // Otherwise, use Direct Charges (platform collects, funds held in escrow until onboarding)
      if (chargesEnabled) {
        // Destination Charges: Payment goes directly to business account
        const session = await this.stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: currency.toLowerCase(),
                product_data: {
                  name: orderName,
                  description: orderDescription,
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
              destination: stripeAccountId, // <-- Payment goes to THIS business's account
            },
            metadata: {
              order_id: orderId,
              business_id: businessId,
              payment_mode: "destination_charge",
            },
          },
          metadata: {
            order_id: orderId,
            business_id: businessId,
            payment_mode: "destination_charge",
          },
          automatic_tax: {
            enabled: false,
          },
        });
        return session;
      } else {
        // Direct Charges: Platform collects payment, funds held in escrow until business completes onboarding
        // Business can sell immediately, but must complete Stripe onboarding to withdraw funds
        console.log(`[Stripe] Business ${businessId} has charges_enabled=false, using Direct Charges (escrow mode)`);
        
        // Add escrow note to description
        const escrowDescription = orderDescription + (orderDescription.includes('funds held') ? '' : ' (funds held until business completes verification)');
        
        const session = await this.stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: currency.toLowerCase(),
                product_data: {
                  name: orderName,
                  description: escrowDescription,
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
          // No transfer_data - payment goes to platform account
          // We'll track escrow balance and transfer after onboarding
          payment_intent_data: {
            metadata: {
              order_id: orderId,
              business_id: businessId,
              payment_mode: "direct_charge_escrow",
              business_amount: businessAmount.toString(),
              platform_commission: platformCommission.toString(),
            },
          },
          metadata: {
            order_id: orderId,
            business_id: businessId,
            payment_mode: "direct_charge_escrow",
            business_amount: businessAmount.toString(),
            platform_commission: platformCommission.toString(),
          },
          automatic_tax: {
            enabled: false,
          },
        });
        return session;
      }
    } catch (error: any) {
      console.error("[Stripe] Failed to create checkout session:", error);
      throw error;
    }
  }

  /**
   * Expire a Stripe checkout session
   */
  async expireCheckoutSession(sessionId: string): Promise<void> {
    try {
      await this.stripe.checkout.sessions.expire(sessionId);
      console.log(`[Stripe] Expired checkout session: ${sessionId}`);
    } catch (error: any) {
      // Session might already be expired or not found - that's okay
      if (error.code === 'resource_missing') {
        console.log(`[Stripe] Session ${sessionId} already expired or not found`);
      } else {
        throw error;
      }
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

      // Fetch order details for user-friendly payment display
      const orderDetailsResult = await pool.query(
        `SELECT 
          b.business_name,
          COALESCE(
            (SELECT string_agg(p.name, ', ' ORDER BY oi.id)
             FROM order_items oi
             JOIN products p ON oi.product_id = p.id
             WHERE oi.order_id = $1
             LIMIT 3),
            ''
          ) as product_names,
          COALESCE(
            (SELECT string_agg(s.name, ', ' ORDER BY osi.id)
             FROM order_service_items osi
             JOIN services s ON osi.service_id = s.id
             WHERE osi.order_id = $1
             LIMIT 3),
            ''
          ) as service_names,
          (SELECT COUNT(*) FROM order_items WHERE order_id = $1) as product_count,
          (SELECT COUNT(*) FROM order_service_items WHERE order_id = $1) as service_count
         FROM orders o
         JOIN businesses b ON o.business_id = b.id
         WHERE o.id = $1`,
        [orderId]
      );

      // Build user-friendly order name (same logic as checkout session)
      let orderDescription = `Order from ${orderDetailsResult.rows[0]?.business_name || 'Business'}`;
      
      if (orderDetailsResult.rows.length > 0) {
        const orderDetails = orderDetailsResult.rows[0];
        const productNames = orderDetails.product_names || '';
        const serviceNames = orderDetails.service_names || '';
        const productCount = parseInt(orderDetails.product_count || '0');
        const serviceCount = parseInt(orderDetails.service_count || '0');
        
        const itemNames: string[] = [];
        if (productNames) {
          if (productCount > 3) {
            itemNames.push(`${productNames} and ${productCount - 3} more item${productCount - 3 > 1 ? 's' : ''}`);
          } else {
            itemNames.push(productNames);
          }
        }
        if (serviceNames) {
          if (serviceCount > 3) {
            itemNames.push(`${serviceNames} and ${serviceCount - 3} more service${serviceCount - 3 > 1 ? 's' : ''}`);
          } else {
            itemNames.push(serviceNames);
          }
        }
        
        if (itemNames.length > 0) {
          orderDescription = `Order from ${orderDetails.business_name}: ${itemNames.join(', ')}`;
        }
      }

      const commissionRate = await this.getCommissionRateForBusiness(businessId);
      const platformCommission = amount * commissionRate;
      const businessAmount = amount - platformCommission;

      if (chargesEnabled) {
        // Destination Charges: Payment goes directly to business account
        const paymentIntent = await this.stripe.paymentIntents.create({
          amount: Math.round(amount * 100),
          currency: currency.toLowerCase(),
          description: orderDescription,
          application_fee_amount: Math.round(platformCommission * 100),
          transfer_data: {
            destination: stripeAccountId,
          },
          metadata: {
            order_id: orderId,
            business_id: businessId,
            payment_mode: "destination_charge",
          },
          receipt_email: customerEmail,
          automatic_payment_methods: {
            enabled: true,
          },
        });
        return paymentIntent;
      } else {
        // Direct Charges: Platform collects payment, funds held in escrow
        console.log(`[Stripe] Business ${businessId} has charges_enabled=false, using Direct Charges (escrow mode) for mobile`);
        
        const escrowDescription = orderDescription + (orderDescription.includes('funds held') ? '' : ' (funds held until business completes verification)');
        
        const paymentIntent = await this.stripe.paymentIntents.create({
          amount: Math.round(amount * 100),
          currency: currency.toLowerCase(),
          description: escrowDescription,
          // No transfer_data - payment goes to platform account
          metadata: {
            order_id: orderId,
            business_id: businessId,
            payment_mode: "direct_charge_escrow",
            business_amount: businessAmount.toString(),
            platform_commission: platformCommission.toString(),
          },
          receipt_email: customerEmail,
          automatic_payment_methods: {
            enabled: true,
          },
        });
        return paymentIntent;
      }
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

  /**
   * Manually sync payment status from Stripe
   * Used when webhook fails or is delayed
   * @param orderId - The order ID to sync
   * @returns Payment status and whether order was updated
   */
  async syncPaymentStatusFromStripe(orderId: string): Promise<{
    success: boolean;
    paymentStatus: 'succeeded' | 'pending' | 'failed' | 'not_found';
    orderUpdated: boolean;
    message: string;
  }> {
    try {
      // Get order with payment info
      const orderResult = await pool.query(
        `SELECT id, status, stripe_payment_intent_id, stripe_session_id, business_id, total
         FROM orders WHERE id = $1`,
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        return {
          success: false,
          paymentStatus: 'not_found',
          orderUpdated: false,
          message: 'Order not found',
        };
      }

      const order = orderResult.rows[0];
      let paymentIntentId: string | null = order.stripe_payment_intent_id;

      // If we have a session_id but no payment_intent_id, get payment_intent from session
      if (!paymentIntentId && order.stripe_session_id) {
        try {
          const session = await this.stripe.checkout.sessions.retrieve(order.stripe_session_id);
          paymentIntentId = session.payment_intent as string | null;
          
          // Update order with payment_intent_id if we found it
          if (paymentIntentId) {
            await pool.query(
              `UPDATE orders SET stripe_payment_intent_id = $1 WHERE id = $2`,
              [paymentIntentId, orderId]
            );
          }
        } catch (error: any) {
          console.error(`[Stripe Sync] Failed to retrieve session ${order.stripe_session_id}:`, error.message);
          return {
            success: false,
            paymentStatus: 'not_found',
            orderUpdated: false,
            message: `Failed to retrieve checkout session: ${error.message}`,
          };
        }
      }

      if (!paymentIntentId) {
        return {
          success: false,
          paymentStatus: 'not_found',
          orderUpdated: false,
          message: 'No payment intent or session found for this order',
        };
      }

      // Retrieve payment intent from Stripe
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

      console.log(`[Stripe Sync] Retrieved payment intent ${paymentIntentId} for order ${orderId}`, {
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
      });

      // If payment succeeded and order is still awaiting_payment, process it
      if (paymentIntent.status === 'succeeded' && order.status === 'awaiting_payment') {
        console.log(`[Stripe Sync] Payment succeeded but order still awaiting_payment. Processing manually...`);
        
        // Manually trigger payment succeeded handler (this will also send emails)
        await this.handlePaymentSucceeded(paymentIntent);
        
        return {
          success: true,
          paymentStatus: 'succeeded',
          orderUpdated: true,
          message: 'Payment verified, order status updated, and confirmation emails sent',
        };
      }

      // If payment succeeded but order is already processed, just return status
      if (paymentIntent.status === 'succeeded' && order.status !== 'awaiting_payment') {
        return {
          success: true,
          paymentStatus: 'succeeded',
          orderUpdated: false,
          message: `Payment succeeded. Order status is already: ${order.status}`,
        };
      }

      // If payment is pending
      if (paymentIntent.status === 'requires_payment_method' || paymentIntent.status === 'requires_confirmation') {
        return {
          success: true,
          paymentStatus: 'pending',
          orderUpdated: false,
          message: 'Payment is still pending',
        };
      }

      // If payment failed
      if (paymentIntent.status === 'canceled' || paymentIntent.status === 'requires_capture') {
        return {
          success: true,
          paymentStatus: 'failed',
          orderUpdated: false,
          message: `Payment status: ${paymentIntent.status}`,
        };
      }

      return {
        success: true,
        paymentStatus: paymentIntent.status as any,
        orderUpdated: false,
        message: `Payment status: ${paymentIntent.status}`,
      };
    } catch (error: any) {
      console.error(`[Stripe Sync] Failed to sync payment status for order ${orderId}:`, error);
      return {
        success: false,
        paymentStatus: 'not_found',
        orderUpdated: false,
        message: `Sync failed: ${error.message}`,
      };
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const orderId = session.metadata?.order_id;
    if (!orderId) return;

    // Extract payment intent from session (if available)
    const paymentIntentId = session.payment_intent as string | null;

    await pool.query(
      `UPDATE orders 
       SET status = 'processing', 
           stripe_session_id = $1,
           stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [session.id, paymentIntentId, orderId]
    );

    // If we have a payment intent, also trigger handlePaymentSucceeded for consistency
    // This ensures emails are sent and order is fully processed
    if (paymentIntentId) {
      try {
        const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
        if (paymentIntent.status === 'succeeded') {
          // Call handlePaymentSucceeded to ensure full processing (emails, stock, etc.)
          await this.handlePaymentSucceeded(paymentIntent);
        }
      } catch (error: any) {
        console.error(`[Stripe] Failed to retrieve payment intent ${paymentIntentId} from session:`, error.message);
        // Continue - order status is already updated
      }
    }
  }

  async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    const orderId = paymentIntent.metadata?.order_id;
    const businessId = paymentIntent.metadata?.business_id;
    
    console.log(`[Stripe Webhook] Processing payment_intent.succeeded`, {
      eventId: paymentIntent.id,
      paymentIntentId: paymentIntent.id,
      orderId,
      businessId,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      timestamp: new Date().toISOString(),
    });
    
    if (!orderId || !businessId) {
      console.error(`[Stripe] Missing order_id or business_id in payment intent metadata`, {
        paymentIntentId: paymentIntent.id,
        metadata: paymentIntent.metadata,
      });
      return;
    }

    const commissionRate = await this.getCommissionRateForBusiness(businessId);
    const totalAmount = paymentIntent.amount / 100;
    const platformCommission = totalAmount * commissionRate;
    const businessAmount = totalAmount - platformCommission;

    // Get order details for initial validation
    const orderResult = await pool.query(
      `SELECT user_id, total, status, points_used, discount_amount, stripe_payment_intent_id
       FROM orders WHERE id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      console.error(`[Stripe] Order ${orderId} not found when processing payment`, {
        paymentIntentId: paymentIntent.id,
      });
      return;
    }

    // Check if this payment intent was already processed (idempotency)
    const existingOrder = orderResult.rows[0];
    if (existingOrder.stripe_payment_intent_id === paymentIntent.id) {
      console.log(`[Stripe] Payment intent ${paymentIntent.id} already processed for order ${orderId}. Skipping.`, {
        currentStatus: existingOrder.status,
      });
      return;
    }

    console.log(`[Stripe] Processing payment for order ${orderId}`, {
      currentStatus: existingOrder.status,
      paymentIntentId: paymentIntent.id,
      totalAmount,
      platformCommission,
      businessAmount,
    });

    // Use database transaction to ensure atomicity of critical operations
    // IMPORTANT: Status check must be INSIDE transaction to prevent race conditions
    const client = await pool.connect();
    const stockIssues: string[] = [];
    
    try {
      await client.query('BEGIN');

      // Re-fetch order inside transaction to get latest status (prevents race conditions)
      // FOR UPDATE locks the row to prevent concurrent modifications
      const orderCheckResult = await client.query(
        `SELECT user_id, total, status, points_used, discount_amount, stripe_payment_intent_id
         FROM orders WHERE id = $1 FOR UPDATE`,
        [orderId]
      );

      if (orderCheckResult.rows.length === 0) {
        await client.query('ROLLBACK');
        console.error(`[Stripe] Order ${orderId} not found in transaction`);
        return;
      }

      const orderInTx = orderCheckResult.rows[0];
      
      // Check if this payment intent was already processed (idempotency check inside transaction)
      if (orderInTx.stripe_payment_intent_id === paymentIntent.id) {
        await client.query('ROLLBACK');
        console.log(`[Stripe] Payment intent ${paymentIntent.id} already processed for order ${orderId}. Skipping.`);
        return;
      }
      
      // Only process orders that are awaiting payment (atomic check inside transaction)
      if (orderInTx.status !== 'awaiting_payment') {
        await client.query('ROLLBACK');
        console.warn(`[Stripe] Order ${orderId} is not in 'awaiting_payment' status (current: ${orderInTx.status}). Still updating payment metadata.`, {
          paymentIntentId: paymentIntent.id,
          currentStatus: orderInTx.status,
          action: 'updating_payment_metadata_only',
        });
        // Still update payment info but don't finalize (outside transaction)
        // This ensures payment metadata is recorded even if status is different
        await pool.query(
          `UPDATE orders 
           SET stripe_payment_intent_id = $1,
               platform_commission = $2,
               business_amount = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [paymentIntent.id, platformCommission, businessAmount, orderId]
        );
        console.log(`[Stripe] Payment metadata updated for order ${orderId} (status: ${orderInTx.status})`);
        return;
      }

      console.log(`[Stripe] Finalizing order ${orderId} after payment confirmation`);

      // FINALIZE ORDER: Update status to 'processing' and payment info
      // Use WHERE status = 'awaiting_payment' to make it atomic and prevent duplicate processing
      const updateResult = await client.query(
        `UPDATE orders 
         SET stripe_payment_intent_id = $1,
             platform_commission = $2,
             business_amount = $3,
             status = 'processing',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4 AND status = 'awaiting_payment'
         RETURNING user_id, total, points_used`,
        [paymentIntent.id, platformCommission, businessAmount, orderId]
      );

      // Check if update succeeded (prevents duplicate processing)
      if (updateResult.rowCount === 0) {
        await client.query('ROLLBACK');
        console.warn(`[Stripe] Order ${orderId} status changed during processing. Another webhook may have processed it.`, {
          paymentIntentId: paymentIntent.id,
          attemptedStatus: 'processing',
          actualStatus: orderInTx.status,
        });
        return;
      }

      console.log(`[Stripe] Order ${orderId} status updated to 'processing'`, {
        paymentIntentId: paymentIntent.id,
        userId: updateResult.rows[0].user_id,
        orderTotal: updateResult.rows[0].total,
      });

      // Use the order data from the update result (from transaction)
      const userId = updateResult.rows[0].user_id;
      const orderTotal = parseFloat(updateResult.rows[0].total);
      const pointsUsed = updateResult.rows[0].points_used;

      if (paymentIntent.transfer_data?.destination) {
        await client.query(
          `UPDATE orders SET stripe_transfer_id = $1 WHERE id = $2`,
          [paymentIntent.transfer_data.destination, orderId]
        );
      }

      // NOW deduct stock for products (this was deferred until payment succeeded)
      const orderItemsResult = await client.query(
        `SELECT oi.product_id, oi.quantity, p.name as product_name, p.stock as current_stock
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = $1`,
        [orderId]
      );

      for (const item of orderItemsResult.rows) {
        // Atomic stock deduction with validation - only deduct if sufficient stock
        const result = await client.query(
          `UPDATE products 
           SET stock = stock - $1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2 AND stock >= $1
           RETURNING stock`,
          [item.quantity, item.product_id]
        );

        if (result.rowCount === 0) {
          // Stock was insufficient - this is a critical issue
          // Business decision: Complete the order (customer already paid) but flag for business attention
          // Alternative: Could fail the order and refund, but that requires additional payment processing
          const issue = `Product ${item.product_name} (ID: ${item.product_id}): Insufficient stock. Needed ${item.quantity}, available ${item.current_stock}`;
          stockIssues.push(issue);
          console.error(`[Stripe] ${issue}`);
          
          // Set stock to 0 to prevent negative values and ensure product shows as out of stock
          await client.query(
            `UPDATE products SET stock = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [item.product_id]
          );
          
          // TODO: Send urgent notification to business about stock issue requiring immediate attention
        } else {
          console.log(`[Stripe] Deducted ${item.quantity} units from product ${item.product_name} (${item.product_id}). New stock: ${result.rows[0].stock}`);
        }
      }

      // Log stock issues if any occurred
      if (stockIssues.length > 0) {
        console.warn(`[Stripe] Order ${orderId} completed but with stock issues:`, stockIssues);
        // Store stock issues in order notes or send email to business
        await client.query(
          `UPDATE orders 
           SET notes = COALESCE(notes || E'\n\n', '') || $1
           WHERE id = $2`,
          [`STOCK WARNING: ${stockIssues.join('; ')}`, orderId]
        );
      }

      // NOW clear cart (this was deferred until payment succeeded)
      await client.query(
        `DELETE FROM cart_items WHERE user_id = $1`,
        [userId]
      );
      await client.query(
        `DELETE FROM cart_service_items WHERE user_id = $1`,
        [userId]
      );
      console.log(`[Stripe] Cleared cart for user ${userId}`);

      // NOW redeem points if they were specified (inside transaction for atomicity)
      if (pointsUsed && parseFloat(pointsUsed) > 0) {
        const pointsToRedeem = parseFloat(pointsUsed);
        try {
          // Atomic points deduction with balance check
          const deductResult = await client.query(
            `UPDATE user_points 
             SET balance = balance - $1,
                 total_redeemed = total_redeemed + $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $2 AND balance >= $1
             RETURNING balance`,
            [pointsToRedeem, userId]
          );

          if (deductResult.rowCount === 0) {
            // Insufficient balance - log but don't fail order (points were already calculated in order total)
            console.warn(`[Stripe] Insufficient points balance for order ${orderId}. User ${userId} tried to redeem ${pointsToRedeem} points.`);
          } else {
            // Record transaction
            await client.query(
              `INSERT INTO points_transactions (user_id, order_id, transaction_type, amount, description)
               VALUES ($1, $2, 'redeemed', $3, $4)`,
              [userId, orderId, pointsToRedeem, `Points redeemed for order ${orderId}`]
            );
            console.log(`[Stripe] Redeemed ${pointsToRedeem} points for order ${orderId}. New balance: ${deductResult.rows[0].balance}`);
          }
        } catch (error: any) {
          console.error(`[Stripe] Failed to redeem points for order ${orderId}:`, error);
          // Don't throw - points redemption failure shouldn't fail the order
        }
      }

      // Award cashback points (1% of total order amount) - inside transaction
      try {
        const cashbackAmount = orderTotal * 0.01; // 1% cashback
        
        // Get or create user points record
        let pointsResult = await client.query(
          'SELECT * FROM user_points WHERE user_id = $1',
          [userId]
        );

        if (pointsResult.rows.length === 0) {
          await client.query(
            `INSERT INTO user_points (user_id, balance, total_earned)
             VALUES ($1, $2, $2)`,
            [userId, cashbackAmount]
          );
        } else {
          await client.query(
            `UPDATE user_points 
             SET balance = balance + $1,
                 total_earned = total_earned + $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $2`,
            [cashbackAmount, userId]
          );
        }

        // Record transaction
        await client.query(
          `INSERT INTO points_transactions (user_id, order_id, transaction_type, amount, description)
           VALUES ($1, $2, 'earned', $3, $4)`,
          [userId, orderId, cashbackAmount, `1% cashback on order ${orderId}`]
        );

        // Update order with points earned
        await client.query(
          'UPDATE orders SET points_earned = $1 WHERE id = $2',
          [cashbackAmount, orderId]
        );

        console.log(`[Stripe] Awarded ${cashbackAmount} cashback points for order ${orderId}`);
      } catch (error: any) {
        console.error(`[Stripe] Failed to award cashback for order ${orderId}:`, error);
        // Don't throw - cashback is a bonus feature
      }

      // Commit the transaction
      await client.query('COMMIT');
      console.log(`[Stripe] Transaction committed successfully for order ${orderId}`);
    } catch (error: any) {
      // Rollback on any error
      await client.query('ROLLBACK');
      console.error(`[Stripe] Transaction rolled back for order ${orderId}:`, {
        error: error.message,
        stack: error.stack,
        paymentIntentId: paymentIntent.id,
        orderStatus: orderInTx?.status || 'unknown',
        timestamp: new Date().toISOString(),
      });
      throw error;
    } finally {
      // Release the client back to the pool
      client.release();
    }

    console.log(`[Stripe] Order ${orderId} finalized successfully`);

    // Send order confirmation emails (outside transaction - non-blocking)
    // This happens after payment succeeds and order is finalized
    try {
      // Get order details with customer and business info
      const orderDetailsResult = await pool.query(
        `SELECT o.*, 
                u.username, u.email as customer_email,
                b.business_name, b.business_address, b.postcode, b.city,
                b.user_id as business_user_id
         FROM orders o
         JOIN users u ON o.user_id = u.id
         JOIN businesses b ON o.business_id = b.id
         WHERE o.id = $1`,
        [orderId]
      );

      if (orderDetailsResult.rows.length === 0) {
        console.error(`[Stripe] Order ${orderId} not found when sending confirmation emails`);
        return;
      }

      const orderDetails = orderDetailsResult.rows[0];

      // Get order items (products)
      const itemsResult = await pool.query(
        `SELECT oi.*, p.name as product_name
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = $1`,
        [orderId]
      );

      // Get order service items
      const servicesResult = await pool.query(
        `SELECT osi.*, s.name as service_name
         FROM order_service_items osi
         JOIN services s ON osi.service_id = s.id
         WHERE osi.order_id = $1`,
        [orderId]
      );

      // Combine all items for email
      const allItems = [
        ...itemsResult.rows.map((item: any) => ({
          name: item.product_name,
          quantity: item.quantity,
          price: parseFloat(item.price),
        })),
        ...servicesResult.rows.map((item: any) => ({
          name: item.service_name,
          quantity: item.quantity,
          price: parseFloat(item.price),
        })),
      ];

      // Build business address
      const businessAddressParts = [
        orderDetails.business_address,
        orderDetails.postcode,
        orderDetails.city,
      ].filter(Boolean);
      const businessAddress = businessAddressParts.join(", ");

      // Build Google Maps link
      const googleMapsLink = businessAddress
        ? `https://maps.google.com/?q=${encodeURIComponent(businessAddress)}`
        : undefined;

      // Get QR code if available (from order metadata or generate)
      const qrCodeUrl = orderDetails.qr_code || undefined;

      // Calculate cashback amount (1% of total)
      const cashbackAmount = parseFloat(orderDetails.points_earned || "0");

      // Send customer confirmation email
      await emailService.sendOrderConfirmationEmail(
        orderDetails.customer_email,
        {
          customerName: orderDetails.username,
          orderId: orderId,
          items: allItems,
          totalAmount: parseFloat(orderDetails.total),
          cashbackAmount: cashbackAmount,
          businessName: orderDetails.business_name,
          businessAddress: businessAddress,
          googleMapsLink: googleMapsLink,
          pickupTime: orderDetails.booking_date && orderDetails.booking_time
            ? `${orderDetails.booking_date} at ${orderDetails.booking_time}`
            : "Ready for pickup - check order status for updates",
          qrCodeUrl: qrCodeUrl,
        }
      );
      console.log(`[Stripe] Order confirmation email sent to customer for order ${orderId}`);

      // Get business email
      const businessUserResult = await pool.query(
        `SELECT email FROM users WHERE id = $1`,
        [orderDetails.business_user_id]
      );

      if (businessUserResult.rows.length > 0) {
        const businessEmail = businessUserResult.rows[0].email;

        // Get business owner name
        const businessOwnerResult = await pool.query(
          `SELECT username FROM users WHERE id = $1`,
          [orderDetails.business_user_id]
        );
        const businessOwnerName = businessOwnerResult.rows[0]?.username || orderDetails.business_name;

        // Send business new order alert email
        await emailService.sendNewOrderAlertEmail(businessEmail, {
          businessOwnerName: businessOwnerName,
          businessName: orderDetails.business_name,
          orderId: orderId,
          customerName: orderDetails.username,
          customerContact: orderDetails.customer_email,
          items: allItems,
          totalAmount: parseFloat(orderDetails.total),
          collectionTimeSlot: orderDetails.booking_date && orderDetails.booking_time
            ? `${orderDetails.booking_date} at ${orderDetails.booking_time}`
            : orderDetails.pickup_time_slot || "To be confirmed",
          businessAddress: businessAddress,
          manageOrderLink: `${process.env.FRONTEND_URL || "http://localhost:5173"}/business/orders/${orderId}`,
        });
        console.log(`[Stripe] New order alert email sent to business for order ${orderId}`);
      } else {
        console.warn(`[Stripe] Business user not found for order ${orderId}, skipping business email`);
      }
    } catch (emailError: any) {
      // Log but don't fail - email is non-critical
      console.error(
        `[Stripe] Failed to send order confirmation emails for order ${orderId}:`,
        {
          error: emailError.message,
          stack: emailError.stack,
          resendConfigured: !!process.env.RESEND_API_KEY,
          smtpConfigured: !!(process.env.SMTP_USER && process.env.SMTP_PASSWORD),
        }
      );
    }
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
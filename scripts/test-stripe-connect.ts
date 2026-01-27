/**
 * Stripe Connect End-to-End Test Script
 * 
 * Tests the complete Stripe Connect flow:
 * 1. Create Express account
 * 2. Generate Account Link (onboarding)
 * 3. Verify account status
 * 4. Test payment processing
 * 5. Verify commission calculation
 * 
 * Usage:
 *   npm run test:stripe-connect
 *   OR
 *   tsx scripts/test-stripe-connect.ts
 */

import { pool } from "../src/db/connection";
import { stripeService } from "../src/services/stripeService";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  data?: any;
}

const results: TestResult[] = [];

function logTest(name: string, passed: boolean, message: string, data?: any) {
  results.push({ testName: name, passed, message, data });
  const icon = passed ? "✅" : "❌";
  console.log(`${icon} ${name}: ${message}`);
  if (data) {
    console.log(`   Data:`, JSON.stringify(data, null, 2));
  }
}

async function testStripeConnection() {
  console.log("\n🔌 Testing Stripe Connection...\n");

  try {
    const isConnected = await stripeService.verifyConnection();
    logTest(
      "Stripe API Connection",
      isConnected,
      isConnected ? "Successfully connected to Stripe API" : "Failed to connect to Stripe API"
    );
  } catch (error: any) {
    logTest("Stripe API Connection", false, `Error: ${error.message}`);
  }
}

async function testExpressAccountCreation() {
  console.log("\n🏢 Testing Express Account Creation...\n");

  try {
    // Create a test business in database first (or use existing)
    const businessResult = await pool.query(`
      SELECT id, business_name, user_id 
      FROM businesses 
      LIMIT 1
    `);

    if (businessResult.rows.length === 0) {
      logTest(
        "Express Account Creation",
        false,
        "No businesses found in database. Create a test business first."
      );
      return;
    }

    const business = businessResult.rows[0];
    const businessId = business.id;
    const testEmail = `test-${Date.now()}@localito-test.com`;

    console.log(`Creating Express account for business: ${business.business_name} (${businessId})`);

    // Check if account already exists
    const existingAccount = await pool.query(
      "SELECT stripe_account_id FROM stripe_connect_accounts WHERE business_id = $1",
      [businessId]
    );

    if (existingAccount.rows.length > 0) {
      const accountId = existingAccount.rows[0].stripe_account_id;
      console.log(`Account already exists: ${accountId}`);
      
      // Retrieve account to verify it's valid
      try {
        const account = await stripeService["stripe"].accounts.retrieve(accountId);
        logTest(
          "Express Account Exists",
          true,
          `Account ${accountId} exists and is valid`,
          {
            accountId: account.id,
            type: account.type,
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled,
            detailsSubmitted: account.details_submitted,
          }
        );
      } catch (error: any) {
        logTest(
          "Express Account Verification",
          false,
          `Account ${accountId} exists in DB but invalid in Stripe: ${error.message}`
        );
      }
    } else {
      // Create new Express account
      try {
        const account = await stripeService.createExpressAccount(businessId, testEmail, "GB");
        logTest(
          "Express Account Creation",
          true,
          `Successfully created Express account: ${account.id}`,
          {
            accountId: account.id,
            type: account.type,
            email: account.email,
            country: account.country,
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled,
          }
        );
      } catch (error: any) {
        logTest(
          "Express Account Creation",
          false,
          `Failed to create account: ${error.message}`,
          { error: error.message, code: error.code }
        );
      }
    }
  } catch (error: any) {
    logTest("Express Account Creation", false, `Database error: ${error.message}`);
  }
}

async function testAccountLinkCreation() {
  console.log("\n🔗 Testing Account Link Creation...\n");

  try {
    const businessResult = await pool.query(`
      SELECT b.id, b.business_name, sca.stripe_account_id
      FROM businesses b
      LEFT JOIN stripe_connect_accounts sca ON b.id = sca.business_id
      WHERE sca.stripe_account_id IS NOT NULL
      LIMIT 1
    `);

    if (businessResult.rows.length === 0) {
      logTest(
        "Account Link Creation",
        false,
        "No businesses with Stripe accounts found. Create an Express account first."
      );
      return;
    }

    const business = businessResult.rows[0];
    const accountId = business.stripe_account_id;

    const returnUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/business/payouts?stripe=onboarded`;
    const refreshUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/business/payouts?stripe=refresh`;

    try {
      const accountLink = await stripeService.createAccountLink(accountId, returnUrl, refreshUrl);
      
      logTest(
        "Account Link Creation",
        true,
        `Successfully created Account Link for onboarding`,
        {
          accountId,
          url: accountLink.url,
          expiresAt: accountLink.expires_at,
          created: accountLink.created,
        }
      );

      console.log(`\n📋 Onboarding URL: ${accountLink.url}`);
      console.log(`   Expires at: ${new Date(accountLink.expires_at * 1000).toISOString()}`);
      console.log(`   Use this URL to complete onboarding in Stripe Dashboard\n`);
    } catch (error: any) {
      logTest(
        "Account Link Creation",
        false,
        `Failed to create Account Link: ${error.message}`,
        { error: error.message, code: error.code }
      );
    }
  } catch (error: any) {
    logTest("Account Link Creation", false, `Database error: ${error.message}`);
  }
}

async function testDashboardLoginLink() {
  console.log("\n🔐 Testing Express Dashboard Login Link...\n");

  try {
    const businessResult = await pool.query(`
      SELECT b.id, b.business_name, sca.stripe_account_id
      FROM businesses b
      JOIN stripe_connect_accounts sca ON b.id = sca.business_id
      WHERE sca.stripe_account_id IS NOT NULL
        AND sca.charges_enabled = true
      LIMIT 1
    `);

    if (businessResult.rows.length === 0) {
      logTest(
        "Dashboard Login Link",
        false,
        "No businesses with active Stripe accounts found. Complete onboarding first."
      );
      return;
    }

    const business = businessResult.rows[0];
    const accountId = business.stripe_account_id;

    try {
      const loginLink = await stripeService.createExpressDashboardLoginLink(accountId);
      
      logTest(
        "Dashboard Login Link",
        true,
        `Successfully created login link for Express Dashboard`,
        {
          accountId,
          url: loginLink.url,
          expiresAt: loginLink.expires_at,
          created: loginLink.created,
        }
      );

      console.log(`\n📋 Express Dashboard URL: ${loginLink.url}`);
      console.log(`   Expires at: ${new Date(loginLink.expires_at * 1000).toISOString()}`);
      console.log(`   Use this URL to access the business's Stripe Dashboard\n`);
    } catch (error: any) {
      logTest(
        "Dashboard Login Link",
        false,
        `Failed to create login link: ${error.message}`,
        { error: error.message, code: error.code }
      );
    }
  } catch (error: any) {
    logTest("Dashboard Login Link", false, `Database error: ${error.message}`);
  }
}

async function testCommissionCalculation() {
  console.log("\n💰 Testing Commission Calculation...\n");

  try {
    const businessResult = await pool.query(`
      SELECT id, business_name 
      FROM businesses 
      LIMIT 1
    `);

    if (businessResult.rows.length === 0) {
      logTest(
        "Commission Calculation",
        false,
        "No businesses found in database"
      );
      return;
    }

    const business = businessResult.rows[0];
    const businessId = business.id;

    try {
      const { tier, turnover } = await stripeService.getCommissionTierForBusiness(businessId);
      
      logTest(
        "Commission Tier Calculation",
        true,
        `Business is in ${tier.name} tier with £${turnover.toFixed(2)} turnover`,
        {
          businessId,
          businessName: business.business_name,
          tier: tier.name,
          commissionRate: tier.commissionRate,
          commissionPercentage: `${(tier.commissionRate * 100).toFixed(1)}%`,
          turnover,
        }
      );

      // Test commission calculation for different order amounts
      const testAmounts = [50, 100, 250, 500];
      console.log("\n   Commission Calculation Examples:");
      for (const amount of testAmounts) {
        const commission = amount * tier.commissionRate;
        const businessAmount = amount - commission;
        console.log(`   £${amount.toFixed(2)} order:`);
        console.log(`     - Commission: £${commission.toFixed(2)} (${(tier.commissionRate * 100).toFixed(1)}%)`);
        console.log(`     - Business receives: £${businessAmount.toFixed(2)}`);
      }
    } catch (error: any) {
      logTest(
        "Commission Calculation",
        false,
        `Failed to calculate commission: ${error.message}`
      );
    }
  } catch (error: any) {
    logTest("Commission Calculation", false, `Database error: ${error.message}`);
  }
}

async function testAccountStatus() {
  console.log("\n📊 Testing Account Status...\n");

  try {
    const accountsResult = await pool.query(`
      SELECT 
        b.id as business_id,
        b.business_name,
        sca.stripe_account_id,
        sca.charges_enabled,
        sca.payouts_enabled,
        sca.onboarding_completed,
        sca.details_submitted
      FROM businesses b
      LEFT JOIN stripe_connect_accounts sca ON b.id = sca.business_id
      ORDER BY sca.created_at DESC
      LIMIT 5
    `);

    if (accountsResult.rows.length === 0) {
      logTest(
        "Account Status",
        false,
        "No businesses found in database"
      );
      return;
    }

    console.log("   Business Stripe Account Status:");
    for (const row of accountsResult.rows) {
      if (row.stripe_account_id) {
        try {
          const account = await stripeService["stripe"].accounts.retrieve(row.stripe_account_id);
          const status = account.charges_enabled && account.payouts_enabled ? "✅ Ready" : "⚠️ Pending";
          
          console.log(`\n   ${row.business_name}:`);
          console.log(`     Account ID: ${account.id}`);
          console.log(`     Status: ${status}`);
          console.log(`     Charges Enabled: ${account.charges_enabled ? "✅" : "❌"}`);
          console.log(`     Payouts Enabled: ${account.payouts_enabled ? "✅" : "❌"}`);
          console.log(`     Details Submitted: ${account.details_submitted ? "✅" : "❌"}`);
          console.log(`     Type: ${account.type}`);
          
          if (!account.charges_enabled || !account.payouts_enabled) {
            console.log(`     ⚠️ Account needs onboarding completion`);
          }
        } catch (error: any) {
          console.log(`\n   ${row.business_name}:`);
          console.log(`     ❌ Error retrieving account: ${error.message}`);
        }
      } else {
        console.log(`\n   ${row.business_name}:`);
        console.log(`     ⚠️ No Stripe account connected`);
      }
    }

    logTest(
      "Account Status Check",
      true,
      `Checked ${accountsResult.rows.length} business accounts`
    );
  } catch (error: any) {
    logTest("Account Status", false, `Database error: ${error.message}`);
  }
}

async function runAllTests() {
  console.log("🧪 Stripe Connect End-to-End Test Suite");
  console.log("=" .repeat(60));
  console.log(`Account: ${process.env.STRIPE_SECRET_KEY?.substring(0, 12)}...`);
  console.log(`Mode: ${process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'LIVE' : 'TEST'}`);
  console.log(`Backend URL: ${process.env.BACKEND_URL || 'Not set'}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'Not set'}`);
  console.log("=" .repeat(60));

  await testStripeConnection();
  await testExpressAccountCreation();
  await testAccountLinkCreation();
  await testDashboardLoginLink();
  await testCommissionCalculation();
  await testAccountStatus();

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📋 Test Summary");
  console.log("=".repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log("\n❌ Failed Tests:");
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.testName}: ${r.message}`);
    });
  }

  console.log("\n" + "=".repeat(60));
  console.log("📝 Next Steps:");
  console.log("=".repeat(60));
  console.log("1. If Account Link was created, use the URL to complete onboarding");
  console.log("2. After onboarding, run this test again to verify account is active");
  console.log("3. Test payment processing with a real order");
  console.log("4. Verify webhook events are received");
  console.log("=".repeat(60));

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch((error) => {
  console.error("❌ Test suite failed:", error);
  process.exit(1);
});

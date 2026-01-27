# Stripe Connect Integration Guide

**Last Updated:** January 2026  
**Status:** ✅ **Production Ready**

---

## Overview

Localito uses **Stripe Connect Express Accounts** for marketplace payments. This is Stripe's recommended approach for marketplaces where:
- The platform is the merchant of record
- Stripe handles business onboarding automatically
- Each business gets their own Express Dashboard
- Payments go directly to business accounts with automatic commission deduction

---

## Account Information

- **Account ID:** `acct_1Stkx2FRbJH070ZC`
- **Display Name:** Localito Marketplace
- **API Keys:** [View in Dashboard](https://dashboard.stripe.com/acct_1Stkx2FRbJH070ZC/apikeys)

---

## Environment Variables

### Required
```env
STRIPE_SECRET_KEY=sk_live_...          # Platform secret key
STRIPE_PUBLISHABLE_KEY=pk_live_...      # Platform publishable key  
STRIPE_WEBHOOK_SECRET=whsec_...         # Webhook signing secret
```

### Platform Settings
```env
PLATFORM_COMMISSION_RATE=0.08           # 8% commission (6-9% range)
BASE_CURRENCY=GBP                       # Base currency
```

### Optional (Not needed for Express accounts)
```env
# STRIPE_CLIENT_ID=ca_...               # Only for Standard account OAuth
# STRIPE_PLATFORM_ACCOUNT_ID=acct_...   # Optional platform account ID
```

**How to get keys:**
1. **Secret & Publishable:** [API Keys Dashboard](https://dashboard.stripe.com/acct_1Stkx2FRbJH070ZC/apikeys)
2. **Webhook Secret:** [Webhooks Dashboard](https://dashboard.stripe.com/webhooks) → Create endpoint → Copy signing secret

---

## User Journey

### 1. Business Onboarding
1. Business signs up on Localito
2. Navigates to `/business/payouts`
3. Clicks "Connect Stripe Account"
4. **Backend:** Creates Express account automatically
5. **Backend:** Generates Account Link
6. **Business:** Redirected to Stripe-hosted onboarding
7. **Business:** Completes Stripe forms (bank details, KYC, etc.)
8. **Stripe:** Redirects back to `/business/payouts?stripe=onboarded`
9. **Webhook:** `account.updated` fires → Account activated
10. Business can now accept payments

### 2. Payment Processing
1. Customer places order
2. **Backend:** Creates Stripe Checkout Session or Payment Intent
3. **Payment:** Goes to business's Stripe account (destination charge)
4. **Commission:** Automatically deducted (platform keeps 6-9%)
5. **Webhook:** `payment_intent.succeeded` fires
6. **Backend:** Updates order status, deducts stock, awards cashback

### 3. Payouts
1. Business views available balance on `/business/payouts`
2. Clicks "Request Payout"
3. **Backend:** Validates balance, creates payout
4. **Stripe:** Processes payout to business's bank account
5. Funds arrive in 1-2 business days

### 4. Dashboard Access
1. Business clicks "View Stripe Dashboard"
2. **Backend:** Generates login link
3. **Business:** Redirected to Express Dashboard
4. Can view transactions, payouts, account settings

---

## API Endpoints

### Business Endpoints
- `GET /api/business/stripe/onboarding-link` - Get Stripe onboarding URL
- `GET /api/business/stripe/dashboard-link` - Get Express Dashboard login link
- `GET /api/business/stripe/status` - Check Stripe connection status
- `GET /api/business/payouts` - View payout history
- `POST /api/business/payouts/request` - Request a payout

### Webhook Endpoint
- `POST /api/stripe/webhook` - Receives Stripe events

**Required Webhook Events:**
- `account.updated` - Account status changes
- `checkout.session.completed` - Payment successful
- `payment_intent.succeeded` - Payment confirmed
- `payment_intent.payment_failed` - Payment failed

---

## Implementation Details

### Express Account Creation
**Location:** `server/src/services/stripeService.ts:218`

```typescript
await stripe.accounts.create({
  type: 'express',
  country: 'GB',
  email: businessEmail,
  capabilities: {
    card_payments: { requested: true },
    transfers: { requested: true },
  },
  metadata: { business_id, platform: 'localito' },
  settings: {
    payouts: { schedule: { interval: 'daily' } }
  }
});
```

### Account Links (Onboarding)
**Location:** `server/src/services/stripeService.ts:481`

Creates Stripe-hosted onboarding flow with return/refresh URLs.

### Payment Processing
**Location:** `server/src/services/stripeService.ts:797`

- Uses **destination charges** (payments go to business accounts)
- Platform commission via `application_fee_amount`
- Supports both Checkout Sessions (web) and Payment Intents (mobile)

### Webhook Handling
**Location:** `server/src/services/stripeService.ts:941`

Handles all required Connect events and updates database accordingly.

---

## Webhook Configuration

### Setup Steps
1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. Enter URL: `https://your-backend-domain.com/api/stripe/webhook`
4. **⚠️ CRITICAL:** Enable **"Listen to events on Connected accounts"**
5. Select events:
   - `account.updated`
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
6. Copy the **Signing secret** (`whsec_...`)
7. Set as `STRIPE_WEBHOOK_SECRET` environment variable

---

## Testing

### Local Testing
Use Stripe CLI to forward webhooks:
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

The CLI will output a webhook secret - use this for local testing.

### Health Check
```bash
GET /api/health
```

Should return:
```json
{
  "services": {
    "stripe": "configured (live)"
  }
}
```

---

## Troubleshooting

### "STRIPE_CLIENT_ID not set"
**Solution:** This is expected. Express accounts don't need `STRIPE_CLIENT_ID`. Only needed for Standard account OAuth.

### "Webhook signature verification failed"
**Solution:** 
1. Ensure `STRIPE_WEBHOOK_SECRET` matches the secret from Stripe Dashboard
2. For local testing, use the secret from Stripe CLI
3. Verify webhook endpoint URL is correct

### "Account not found"
**Solution:**
1. Verify account ID starts with `acct_`
2. Check account exists in Stripe Dashboard → Connect → Accounts
3. Ensure account is Express type (not Standard)

### "Payment failed"
**Solution:**
- Check webhook `payment_intent.payment_failed` is handled
- Verify business account has `charges_enabled: true`
- Check Stripe Dashboard for specific error codes

---

## Key Features

✅ **Express Accounts** - Automatic onboarding, no OAuth needed  
✅ **Destination Charges** - Payments go directly to business accounts  
✅ **Automatic Commission** - Platform fee deducted automatically  
✅ **Express Dashboard** - Businesses can access their Stripe dashboard  
✅ **Daily Payouts** - Configured for daily payouts (instant when available)  
✅ **Webhook Integration** - Real-time status updates  
✅ **Error Handling** - Comprehensive error handling and logging  

---

## Architecture

```
Business → Localito → Stripe Express Account
                ↓
         Platform Commission (6-9%)
                ↓
         Payment to Business Account
                ↓
         Business Can Request Payout
```

**Payment Flow:**
1. Customer pays → Stripe Checkout/Payment Intent
2. Payment goes to business's Express account
3. Platform commission automatically deducted
4. Business receives net amount
5. Business can request payout anytime

---

## References

- [Stripe Express Accounts](https://docs.stripe.com/connect/express-accounts)
- [Account Links API](https://docs.stripe.com/api/account_links)
- [Marketplace Setup](https://docs.stripe.com/connect/marketplace)
- [Webhook Events](https://docs.stripe.com/webhooks)

---

## Support

For Stripe-specific issues:
1. Check [Stripe Dashboard](https://dashboard.stripe.com) for account status
2. Review webhook logs in Stripe Dashboard
3. Check application logs for error messages
4. Verify environment variables are set correctly

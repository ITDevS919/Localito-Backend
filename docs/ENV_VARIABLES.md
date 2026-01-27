# Environment Variables Guide

**Last Updated:** January 2026

This document describes all environment variables required for the Localito server.

---

## Stripe Connect Configuration

**📖 For complete Stripe documentation, see [STRIPE_GUIDE.md](./STRIPE_GUIDE.md)**

### Quick Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `STRIPE_SECRET_KEY` | Platform secret key | ✅ Yes |
| `STRIPE_PUBLISHABLE_KEY` | Platform publishable key | ✅ Yes |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret | ✅ Yes |
| `PLATFORM_COMMISSION_RATE` | Commission rate (0.06-0.09) | No (default: 0.08) |
| `BASE_CURRENCY` | Base currency | No (default: GBP) |

**Account ID:** `acct_1Stkx2FRbJH070ZC`  
**Get Keys:** [API Keys Dashboard](https://dashboard.stripe.com/acct_1Stkx2FRbJH070ZC/apikeys)  
**Webhook Setup:** [Webhooks Dashboard](https://dashboard.stripe.com/webhooks)

**Note:** `STRIPE_CLIENT_ID` is **NOT required** for Express accounts (only for Standard account OAuth).

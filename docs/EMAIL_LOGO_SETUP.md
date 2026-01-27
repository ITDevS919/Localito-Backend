# Email Logo Setup Guide

## Problem
The logo was missing from emails because `https://localito.com/logo.png` doesn't exist yet (domain not live).

## Solution
All email templates now use a configurable logo URL via the `EMAIL_LOGO_URL` environment variable.

## Quick Fix Options

### Option 1: Use Environment Variable (Recommended)
Add to your `.env` file:

```bash
# Use your deployed frontend URL (if available)
EMAIL_LOGO_URL=https://your-frontend-domain.com/logo.png

# OR use a CDN/hosting service
EMAIL_LOGO_URL=https://your-cdn.com/localito-logo.png

# OR use your backend URL if serving static files
EMAIL_LOGO_URL=https://your-backend-domain.com/logo.png
```

### Option 2: Automatic Detection
If `FRONTEND_URL` is set in your `.env`, the logo will automatically use:
```
${FRONTEND_URL}/logo.png
```

### Option 3: Temporary Hosting
For immediate testing, you can:
1. Upload `localito-repo/client/public/logo.png` to:
   - Imgur (get direct link)
   - Cloudinary
   - AWS S3
   - Any image hosting service
2. Set `EMAIL_LOGO_URL` to that URL

### Option 4: Serve from Backend
If your backend serves static files, ensure the logo is accessible at `/logo.png` and set:
```bash
EMAIL_LOGO_URL=${BACKEND_URL}/logo.png
```

## Production Setup

Once `localito.com` is live and the logo is accessible at `https://localito.com/logo.png`, you can either:
- Remove `EMAIL_LOGO_URL` from `.env` (it will default to `https://localito.com/logo.png`)
- Or explicitly set it: `EMAIL_LOGO_URL=https://localito.com/logo.png`

## Verification

After setting `EMAIL_LOGO_URL`, test by sending a test email. The logo should now appear in all emails.

## Files Updated

All 19 email templates have been updated to use `EMAIL_LOGO_URL`:
- ✅ OurStory.tsx
- ✅ OrderConfirmation.tsx
- ✅ OrderReadyForPickup.tsx
- ✅ AbandonedCart.tsx
- ✅ CartReminder.tsx
- ✅ OrderCollectionConfirmed.tsx
- ✅ PasswordReset.tsx
- ✅ WelcomeVerification.tsx
- ✅ OrderCancellation.tsx
- ✅ NewOrderAlert.tsx
- ✅ PendingOrderReminder.tsx
- ✅ PaymentReceived.tsx
- ✅ KYCVerificationStatus.tsx
- ✅ BusinessPasswordReset.tsx
- ✅ BusinessWelcome.tsx
- ✅ LowStockAlert.tsx
- ✅ PaymentIssue.tsx
- ✅ CriticalOrderIssueAlert.tsx
- ✅ AccountSuspensionWarning.tsx

## Constants File

The logo URL is configured in `server/src/emails/constants.ts` and follows this priority:
1. `EMAIL_LOGO_URL` environment variable (highest priority)
2. `FRONTEND_URL/logo.png`
3. `BACKEND_URL/logo.png`
4. `https://localito.com/logo.png` (fallback for production)

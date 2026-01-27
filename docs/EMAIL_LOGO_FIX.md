# Email Logo Fix - Backend URL Solution

## Problem
The logo wasn't displaying in emails because `https://localito.com/logo.png` may not be accessible yet (domain not fully live or email clients blocking external images).

## Solution
1. **Added dedicated logo route** at `/api/logo.png` that serves the logo directly from the backend
2. **Updated email constants** to prioritize `BACKEND_URL/api/logo.png` over the production domain
3. **Logo is now served from backend** which is always accessible and reliable

## Changes Made

### 1. Logo Route (`server/src/routes/index.ts`)
- Added route: `GET /api/logo.png`
- Serves logo from `client/public/logo.png`
- Includes proper cache headers (1 year)
- Returns 404 if logo file not found

### 2. Email Constants (`server/src/emails/constants.ts`)
- Updated `getLogoUrl()` to prioritize:
  1. `EMAIL_LOGO_URL` (explicit override)
  2. `BACKEND_URL/api/logo.png` (backend route - **NEW**)
  3. `FRONTEND_URL/logo.png` (frontend static)
  4. `https://localito.com/logo.png` (fallback)

## Configuration

### Environment Variables
Make sure `BACKEND_URL` is set in your environment:
```env
BACKEND_URL=http://localhost:5000  # Development
BACKEND_URL=https://localito-backend.onrender.com  # Production
```

### Testing
1. Start your backend server
2. Verify logo is accessible: `http://localhost:5000/api/logo.png` (or your BACKEND_URL)
3. Send a test email - logo should now display correctly

## Why This Works
- **Backend is always accessible**: Unlike the frontend domain, the backend API is always running
- **Direct file serving**: No dependency on client build or static file serving
- **Email client friendly**: Backend URLs are typically trusted by email clients
- **Fallback chain**: Multiple fallbacks ensure logo always has a source

## Next Steps
1. Set `BACKEND_URL` environment variable in production
2. Verify logo displays in test emails
3. Once `localito.com` domain is fully live, you can optionally switch back to using the frontend URL

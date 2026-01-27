/**
 * Email template constants
 * These can be overridden via environment variables
 */

// Logo URL - can be set via EMAIL_LOGO_URL, or defaults to BACKEND_URL/logo.png
// For production, set EMAIL_LOGO_URL to your CDN or verified domain URL
// Priority: EMAIL_LOGO_URL > BACKEND_URL/logo.png > FRONTEND_URL/logo.png > localito.com/logo.png
const getLogoUrl = (): string => {
  // Explicit override takes highest priority
  if (process.env.EMAIL_LOGO_URL) {
    return process.env.EMAIL_LOGO_URL;
  }
  
  // Backend URL is most reliable for email images (served directly from API)
  // Try /api/logo.png first (dedicated route), then /logo.png (static file)
  const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, '');
  if (backendUrl) {
    // Use /api/logo.png as it's guaranteed to work via our route
    return `${backendUrl}/api/logo.png`;
  }
  
  // Fallback to frontend URL
  const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '');
  if (frontendUrl) {
    return `${frontendUrl}/logo.png`;
  }
  
  // Final fallback to production URL (will work once domain is live)
  return 'https://localito.com/logo.png';
};

export const EMAIL_LOGO_URL = getLogoUrl();

// Base URL for links in emails
export const EMAIL_BASE_URL = 
  process.env.FRONTEND_URL?.replace(/\/$/, '') || 
  'https://localito.com';

// Help center URL
export const EMAIL_HELP_URL = 
  process.env.EMAIL_HELP_URL || 
  `${EMAIL_BASE_URL}/help`;

// Unsubscribe URL
export const EMAIL_UNSUBSCRIBE_URL = 
  process.env.EMAIL_UNSUBSCRIBE_URL || 
  `${EMAIL_BASE_URL}/unsubscribe`;

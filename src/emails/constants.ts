/**
 * Email template constants
 * These can be overridden via environment variables
 */

// Logo URL - can be set via EMAIL_LOGO_URL, or defaults to BACKEND_URL/logo.png
// For production, set EMAIL_LOGO_URL to your CDN or verified domain URL
// Priority: EMAIL_LOGO_URL > BACKEND_URL/logo.png > FRONTEND_URL/logo.png > localito.com/logo.png
// Note: Gmail/Outlook proxy images; the logo URL must be publicly reachable for it to display
// (localhost will not work when the email is opened in Gmail, as their servers cannot fetch it)
const getLogoUrl = (): string => {
  const envLogo = process.env.EMAIL_LOGO_URL?.trim();
  if (envLogo) {
    return envLogo;
  }

  const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, '');
  if (backendUrl) {
    return `${backendUrl}/api/logo.png`;
  }

  const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '');
  if (frontendUrl) {
    return `${frontendUrl}/logo.png`;
  }

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

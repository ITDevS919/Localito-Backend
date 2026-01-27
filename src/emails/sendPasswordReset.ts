import { render } from '@react-email/render';
import PasswordResetEmail from './PasswordReset';
import * as React from 'react';

export interface PasswordResetData {
  userName: string;
  resetLink: string;
  helpCenterLink?: string;
}

/**
 * Renders the Password Reset email template to HTML
 */
export async function renderPasswordResetEmail(
  data: PasswordResetData
): Promise<string> {
  const emailComponent = React.createElement(PasswordResetEmail, data);
  return await render(emailComponent);
}

/**
 * Renders the Password Reset email template to plain text
 */
export function renderPasswordResetEmailText(
  data: PasswordResetData
): string {
  return `Dear ${data.userName},

Reset Your Localito Password

We've received a request to reset your Localito password. If this wasn't you, please ignore this email and contact us immediately for security.

🔒 Security Notice
If you didn't request a password reset, please contact us immediately at security@localito.com

To reset your password, click the link below. This link will expire in 1 hour for your protection:

${data.resetLink}

If you need help, reply to this email or visit our help centre: ${data.helpCenterLink || 'https://localito.com/help'}

Stay safe and keep shopping local! 💙

Best regards,
Localito Marketplace Ltd
www.localito.com

---
Security: Never share your password reset link with anyone. Localito staff will never ask for your password.

Company Number: 16959163
© 2026 Localito Marketplace Ltd. All rights reserved.
`;
}

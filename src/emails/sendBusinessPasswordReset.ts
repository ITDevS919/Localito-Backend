import { render } from '@react-email/render';
import BusinessPasswordResetEmail from './BusinessPasswordReset';
import * as React from 'react';

export interface BusinessPasswordResetData {
  businessOwnerName: string;
  resetLink: string;
  helpCenterLink?: string;
}

/**
 * Renders the Business Password Reset email template to HTML
 */
export async function renderBusinessPasswordResetEmail(
  data: BusinessPasswordResetData
): Promise<string> {
  const emailComponent = React.createElement(BusinessPasswordResetEmail, data);
  return await render(emailComponent);
}

/**
 * Renders the Business Password Reset email template to plain text
 */
export function renderBusinessPasswordResetEmailText(
  data: BusinessPasswordResetData
): string {
  return `Dear ${data.businessOwnerName},

Reset Your Localito Business Password

We've received a request to reset the password for your Localito business account. If this wasn't you, please ignore this email and contact us immediately for security reasons.

To reset your password, click the link below. This link will expire in 1 hour for your protection:

${data.resetLink}

If you need further assistance, please contact us at hello@localito.com${data.helpCenterLink ? ` or visit ${data.helpCenterLink}` : ''}.

Stay secure and keep thriving on Localito!

Best regards,
Localito Marketplace Ltd
Email: hello@localito.com
Link: https://localito.com

---
Company Number: 16959163
© 2026 Localito Marketplace Ltd. All rights reserved.
`;
}

import { render } from '@react-email/render';
import AccountSuspensionWarningEmail from './AccountSuspensionWarning';
import * as React from 'react';

export interface AccountSuspensionWarningData {
  userName: string;
  businessName?: string; // Optional for business accounts
  status: 'suspended' | 'warning';
  reasons: string[]; // Array of specific reasons
  specificAction: string; // e.g., "Update your listings to comply"
  timeframe: string; // e.g., "7 days"
  termsLink: string; // Link to Terms/Guidelines
  appealDeadline?: number; // Days to appeal (default 7)
}

/**
 * Renders the Account Suspension/Warning email template to HTML
 */
export async function renderAccountSuspensionWarningEmail(
  data: AccountSuspensionWarningData
): Promise<string> {
  const emailComponent = React.createElement(AccountSuspensionWarningEmail, data);
  return await render(emailComponent);
}

/**
 * Renders the Account Suspension/Warning email template to plain text
 */
export function renderAccountSuspensionWarningEmailText(
  data: AccountSuspensionWarningData
): string {
  const statusText = data.status === 'suspended' ? 'Suspended' : 'Warning Issued';
  const displayName = data.businessName ? `${data.userName} / ${data.businessName}` : data.userName;
  const appealDays = data.appealDeadline || 7;

  const reasonsList = data.reasons.map((reason) => `  - ${reason}`).join('\n');

  return `Dear ${displayName},

Important: Your Localito Account ${statusText} Notice

We're reaching out because we've detected an issue with your Localito account that requires attention.

Account Status: ${statusText}

Reason(s) for Action:
${reasonsList}

We take these matters seriously to maintain a safe, trustworthy platform for all businesses and shoppers.

Actions Required:
To resolve this:
1. Review our Terms of Service and Community Guidelines here: ${data.termsLink}
2. ${data.specificAction} within ${data.timeframe}
3. Reply to this email with any additional information or corrections

${data.status === 'suspended' ? 'Failure to act may result in permanent suspension.\n' : ''}Appeal Process:
If you believe this is an error, you can appeal by replying to this email within ${appealDays} days. Provide details and any supporting evidence. Our team will review within 5 business days and respond with a final decision.

We're committed to supporting our community – if this is a misunderstanding, let's get it sorted quickly.

Best regards,
Localito Marketplace Ltd
https://localito.com

---
Company Number: 16959163
© 2026 Localito Marketplace Ltd. All rights reserved.
`;
}

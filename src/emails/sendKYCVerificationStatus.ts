import { render } from '@react-email/render';
import KYCVerificationStatusEmail from './KYCVerificationStatus';
import * as React from 'react';

export interface KYCVerificationStatusData {
  userName: string;
  status: 'approved' | 'rejected';
  rejectionReason?: string; // Required if status is 'rejected'
  appDashboardLink?: string; // Link to app/dashboard
  resubmissionLink?: string; // Link to resubmit documents (required if rejected)
}

/**
 * Renders the KYC Verification Status email template to HTML
 */
export async function renderKYCVerificationStatusEmail(
  data: KYCVerificationStatusData
): Promise<string> {
  const emailComponent = React.createElement(KYCVerificationStatusEmail, data);
  return await render(emailComponent);
}

/**
 * Renders the KYC Verification Status email template to plain text
 */
export function renderKYCVerificationStatusEmailText(
  data: KYCVerificationStatusData
): string {
  const statusText = data.status === 'approved' ? 'Approved' : 'Rejected';
  const subject = `Your Localito KYC Verification Status – ${statusText}`;

  let body = `Dear ${data.userName},

Your Localito KYC Verification Status – ${statusText}

We're writing to update you on your KYC (Know Your Customer) verification for Localito Marketplace Ltd.

Verification Status: ${statusText}
`;

  if (data.status === 'approved') {
    body += `
If Approved:
Congratulations! Your account is now fully verified and ready for use. You can now list products/services, receive payments, and access all features.`;
    
    if (data.appDashboardLink) {
      body += ` Head to the app to get started: ${data.appDashboardLink}`;
    }
  } else {
    body += `
If Rejected:
Unfortunately, your KYC verification was not approved${data.rejectionReason ? ` due to ${data.rejectionReason}` : ''}. This is often a simple fix.

Next Steps if Rejected:
1. Review the requirements in the app (e.g., valid ID, proof of address, business registration if applicable).
`;
    
    if (data.resubmissionLink) {
      body += `2. Resubmit updated documents via ${data.resubmissionLink} within 7 days.\n`;
    }
    
    body += `3. If you need help, reply to this email or contact support at hello@localito.com – we're here to assist.`;
  }

  body += `

Verification helps keep Localito safe and compliant for everyone. Thank you for your patience!

Localito Marketplace Ltd
https://localito.com

---
Company Number: 16959163
© 2026 Localito Marketplace Ltd. All rights reserved.
`;

  return body;
}

import { render } from '@react-email/render';
import PaymentIssueEmail from './PaymentIssue';
import * as React from 'react';

export interface PaymentIssueData {
  customerName: string;
  orderId: string;
  businessName: string;
  reason: string; // e.g., "Insufficient funds, Card expired, or Payment gateway error"
  appLink: string; // Link to app
  reservationPeriod: string; // e.g., "24 hours"
}

/**
 * Renders the Payment Issue email template to HTML
 */
export async function renderPaymentIssueEmail(
  data: PaymentIssueData
): Promise<string> {
  const emailComponent = React.createElement(PaymentIssueEmail, data);
  return await render(emailComponent);
}

/**
 * Renders the Payment Issue email template to plain text
 */
export function renderPaymentIssueEmailText(
  data: PaymentIssueData
): string {
  return `Dear ${data.customerName},

Payment Issue with Your Localito Order – ${data.orderId}

We're sorry, but your payment for Order ${data.orderId} from ${data.businessName} has failed.

Reason: ${data.reason} – please check with your bank.

Retry Instructions:
1. Log back into the app: ${data.appLink}
2. Go to your cart or pending order and try paying again with a different card or method.
3. If the issue persists, contact your bank or reply to this email for help – we're here to assist.

Your items are still reserved for ${data.reservationPeriod}. Don't miss out on supporting your local business.

Best regards,
Localito Marketplace Ltd
Email: hello@localito.com
Link: https://localito.com

---
Company Number: 16959163
© 2026 Localito Marketplace Ltd. All rights reserved.
`;
}

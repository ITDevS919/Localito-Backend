import { render } from '@react-email/render';
import OrderCancellationEmail from './OrderCancellation';
import * as React from 'react';

export interface OrderCancellationData {
  customerName: string;
  orderId: string;
  businessName: string;
  refundAmount: number;
  cancellationReason?: string;
  isRefunded: boolean; // true if refunded, false if just cancelled
}

/**
 * Renders the Order Cancellation email template to HTML
 */
export async function renderOrderCancellationEmail(
  data: OrderCancellationData
): Promise<string> {
  const emailComponent = React.createElement(OrderCancellationEmail, data);
  return await render(emailComponent);
}

/**
 * Renders the Order Cancellation email template to plain text
 */
export function renderOrderCancellationEmailText(
  data: OrderCancellationData
): string {
  const cancellationText = data.isRefunded 
    ? 'has been successfully cancelled and refunded'
    : 'has been successfully cancelled';
  
  const reasonText = data.cancellationReason 
    ? `due to ${data.cancellationReason}`
    : 'at your request';

  let refundSection = '';
  if (data.isRefunded) {
    refundSection = `
Refund Amount:
We'll refund the full £${data.refundAmount.toFixed(2)} GBP back to your original payment method.

Refund Timeline:
Refunds typically process within 3–5 business days, depending on your bank or card provider. You'll receive a confirmation email once complete.
`;
  }

  return `Dear ${data.customerName},

Your Localito Order Cancellation/Refund Confirmation – ${data.orderId}

We're sorry to see your order from ${data.businessName} has been cancelled. Here's what you need to know:

Cancellation Notice:
Your order ${data.orderId} ${cancellationText} ${reasonText}.
${refundSection}
If this cancellation wasn't requested by you, or if you have any questions, please reply to this email right away.

Thank you for supporting Manchester's independents – we hope to see you back soon!

Kind Regards,
Localito Marketplace Ltd
www.localito.com

---
Company Number: 16959163
© 2026 Localito Marketplace Ltd. All rights reserved.
`;
}

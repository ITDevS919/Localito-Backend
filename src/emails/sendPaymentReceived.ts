import { render } from '@react-email/render';
import PaymentReceivedEmail from './PaymentReceived';
import * as React from 'react';

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface PaymentReceivedData {
  businessOwnerName: string;
  businessName: string;
  orderId: string;
  customerName: string;
  items: OrderItem[];
  originalTotal: number;
  commissionAmount: number;
  commissionPercentage: number;
  netAmount: number;
  payoutDate: string;
  transactionReference: string;
}

/**
 * Renders the Payment Received email template to HTML
 */
export async function renderPaymentReceivedEmail(
  data: PaymentReceivedData
): Promise<string> {
  const emailComponent = React.createElement(PaymentReceivedEmail, data);
  return await render(emailComponent);
}

/**
 * Renders the Payment Received email template to plain text
 */
export function renderPaymentReceivedEmailText(
  data: PaymentReceivedData
): string {
  const itemsList = data.items
    .map((item) => `  - ${item.name}: ${item.quantity} × £${item.price.toFixed(2)}`)
    .join('\n');

  return `Dear ${data.businessOwnerName} / ${data.businessName} Team,

Payment Received – Order ${data.orderId} Payout Confirmed!

We're pleased to confirm that your payout for Order ${data.orderId} has been processed instantly following collection confirmation.

Payout Confirmation:
- Amount Received: £${data.netAmount.toFixed(2)} GBP (deposited to your connected Stripe account)
- Transaction Details:
  - Order ID: ${data.orderId}
  - Customer Name: ${data.customerName}
  - Items/Services:
${itemsList}
  - Original Total: £${data.originalTotal.toFixed(2)} GBP
  - Commission Deducted: £${data.commissionAmount.toFixed(2)} GBP (${data.commissionPercentage}%)
  - Payout Date: ${data.payoutDate}
  - Reference: ${data.transactionReference}

Your funds should appear in your bank account within 1–2 business days (depending on your Stripe settings).

Thanks for being part of Localito – every order keeps Manchester's independents thriving!

Best regards,
Localito Marketplace Ltd
https://localito.com

---
Company Number: 16959163
© 2026 Localito Marketplace Ltd. All rights reserved.
`;
}

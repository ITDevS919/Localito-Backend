import { render } from '@react-email/render';
import OrderConfirmationEmail from './OrderConfirmation';
import * as React from 'react';

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface OrderConfirmationData {
  customerName: string;
  orderId: string;
  items: OrderItem[];
  totalAmount: number;
  cashbackAmount: number;
  businessName: string;
  businessAddress: string;
  googleMapsLink?: string;
  pickupTime: string;
  qrCodeUrl?: string;
}

/**
 * Renders the Order Confirmation email template to HTML
 */
export async function renderOrderConfirmationEmail(
  data: OrderConfirmationData
): Promise<string> {
  const emailComponent = React.createElement(OrderConfirmationEmail, data);
  return await render(emailComponent);
}

/**
 * Renders the Order Confirmation email template to plain text
 */
export function renderOrderConfirmationEmailText(
  data: OrderConfirmationData
): string {
  const itemsList = data.items
    .map((item) => `  - ${item.name}: ${item.quantity} × £${item.price.toFixed(2)}`)
    .join('\n');

  return `Dear ${data.customerName},

Thank you for shopping local with Localito! Your order has been successfully processed and is ready for pickup.

Order Details:
- Order ID: ${data.orderId}
- Items:
${itemsList}
- Total Amount: £${data.totalAmount.toFixed(2)}
- Cashback Earned: £${data.cashbackAmount.toFixed(2)} (1% instant cashback – redeem on your next order!)

Collection Instructions:
Your order is ready for pickup at ${data.businessName}, ${data.businessAddress}${data.googleMapsLink ? `\n${data.googleMapsLink}` : ''}

Pickup Time: ${data.pickupTime}

${data.qrCodeUrl ? 'Please show the QR code at the store for quick verification.' : ''}

If you need to change anything, please contact the business directly.

Thank you for supporting your local business – your support keeps independents thriving! 💙

Best regards,
Localito Marketplace Ltd
hello@localito.com
https://localito.com

---
Company Number: 16959163
© 2026 Localito Marketplace Ltd. All rights reserved.
`;
}

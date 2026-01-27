import { render } from '@react-email/render';
import AbandonedCartEmail from './AbandonedCart';
import * as React from 'react';

export interface CartItem {
  name: string;
  quantity: number;
  price: number;
}

export interface AbandonedCartData {
  customerName: string;
  businessName: string;
  items: CartItem[];
  cartTotal: number;
  abandonedCartLink: string;
}

/**
 * Renders the Abandoned Cart email template to HTML
 */
export async function renderAbandonedCartEmail(
  data: AbandonedCartData
): Promise<string> {
  const emailComponent = React.createElement(AbandonedCartEmail, data);
  return await render(emailComponent);
}

/**
 * Renders the Abandoned Cart email template to plain text
 */
export function renderAbandonedCartEmailText(
  data: AbandonedCartData
): string {
  const itemsList = data.items
    .map((item) => `  - ${item.name}: ${item.quantity} × £${item.price.toFixed(2)}`)
    .join('\n');

  return `Dear ${data.customerName},

Don't Miss Out – Your Localito Cart is Waiting!

We noticed you added some great items from ${data.businessName} to your cart but didn't quite complete the order. No worries – they're still there!

Your Cart Summary:
${itemsList}
- Total: £${data.cartTotal.toFixed(2)} GBP

As a nudge, we are reminding you that you can earn 1% cashback by completing this order that you can use immediately on your next order. When ordering through Localito you are helping to keep money in your local community by supporting your local business.

Head back to the app and pick up where you left off: ${data.abandonedCartLink}

Supporting local independents like ${data.businessName} keeps Manchester thriving – let's make it happen! 💙

Best,
Localito Marketplace Ltd
https://localito.com

---
Company Number: 16959163
© 2026 Localito Marketplace Ltd. All rights reserved.
`;
}

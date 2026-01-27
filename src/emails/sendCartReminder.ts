import { render } from '@react-email/render';
import CartReminderEmail from './CartReminder';
import * as React from 'react';

export interface CartItem {
  name: string;
  quantity: number;
  price: number;
}

export interface CartReminderData {
  customerName: string;
  businessName: string;
  items: CartItem[];
  cartTotal: number;
  abandonedCartLink: string;
}

/**
 * Renders the Cart Reminder email template to HTML
 */
export async function renderCartReminderEmail(
  data: CartReminderData
): Promise<string> {
  const emailComponent = React.createElement(CartReminderEmail, data);
  return await render(emailComponent);
}

/**
 * Renders the Cart Reminder email template to plain text
 */
export function renderCartReminderEmailText(
  data: CartReminderData
): string {
  const itemsList = data.items
    .map((item) => `  - ${item.name}: ${item.quantity} × £${item.price.toFixed(2)}`)
    .join('\n');

  return `Dear ${data.customerName},

Quick Reminder – Your Localito Cart Awaits!

Hope you're having a great day!

We wanted to gently remind you about the items from ${data.businessName} still in your cart. They're ready and waiting to bring a little local magic your way.

Your Cart Quick Peek:
${itemsList}
- Total: £${data.cartTotal.toFixed(2)} GBP

Complete your order now and enjoy 1% instant cashback, redeemable on your next local find. Plus, no delivery fees – just seamless in-store pickup!

Back to your cart: ${data.abandonedCartLink}

Supporting independents like ${data.businessName} keeps our communities thriving. Let's make it happen!

Best,
Localito Marketplace Ltd
Email: hello@localito.com
Link: www.localito.com

---
Company Number: 16959163
© 2026 Localito Marketplace Ltd. All rights reserved.
`;
}

import { render } from '@react-email/render';
import PendingOrderReminderEmail from './PendingOrderReminder';
import * as React from 'react';

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface PendingOrderReminderData {
  businessOwnerName: string;
  businessName: string;
  orderId: string;
  customerName: string;
  items: OrderItem[];
  totalAmount: number;
  requestedCollectionTime: string;
  manageOrderLink: string;
}

/**
 * Renders the Pending Order Reminder email template to HTML
 */
export async function renderPendingOrderReminderEmail(
  data: PendingOrderReminderData
): Promise<string> {
  const emailComponent = React.createElement(PendingOrderReminderEmail, data);
  return await render(emailComponent);
}

/**
 * Renders the Pending Order Reminder email template to plain text
 */
export function renderPendingOrderReminderEmailText(
  data: PendingOrderReminderData
): string {
  const itemsList = data.items
    .map((item) => `  - ${item.name}: ${item.quantity} × £${item.price.toFixed(2)}`)
    .join('\n');

  return `Dear ${data.businessOwnerName} / ${data.businessName} Team,

Friendly Reminder – Order ${data.orderId} is Pending at ${data.businessName}

We hope you're having a great day! Just a quick nudge about a pending order on Localito.

Order Details:
- Order ID: ${data.orderId}
- Customer Name: ${data.customerName}
- Items:
${itemsList}
- Total Amount: £${data.totalAmount.toFixed(2)} GBP
- Requested Collection/Booking Time: ${data.requestedCollectionTime}

This order is still marked as pending – please update the status to "Ready" in the app once prepared. Your customer will get notified automatically, and they'll be thrilled to collect!

Manage it here: ${data.manageOrderLink}

Thanks for keeping things moving – every order supports Manchester's independents!

Best regards,
Localito Marketplace Ltd
https://localito.com

---
Company Number: 16959163
© 2026 Localito Marketplace Ltd. All rights reserved.
`;
}

import { render } from '@react-email/render';
import NewOrderAlertEmail from './NewOrderAlert';
import * as React from 'react';

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface NewOrderAlertData {
  businessOwnerName: string;
  businessName: string;
  orderId: string;
  customerName: string;
  customerContact: string; // Email or phone
  items: OrderItem[];
  totalAmount: number;
  collectionTimeSlot: string;
  businessAddress: string;
  manageOrderLink: string;
}

/**
 * Renders the New Order Alert email template to HTML
 */
export async function renderNewOrderAlertEmail(
  data: NewOrderAlertData
): Promise<string> {
  const emailComponent = React.createElement(NewOrderAlertEmail, data);
  return await render(emailComponent);
}

/**
 * Renders the New Order Alert email template to plain text
 */
export function renderNewOrderAlertEmailText(
  data: NewOrderAlertData
): string {
  const itemsList = data.items
    .map((item) => `  - ${item.name}: ${item.quantity} × £${item.price.toFixed(2)}`)
    .join('\n');

  return `Dear ${data.businessOwnerName} / ${data.businessName} Team,

New Order Alert – ${data.orderId} from ${data.customerName}

Exciting news – a new order has just been placed on Localito!

Order Details:
- Order ID: ${data.orderId}
- Customer Name: ${data.customerName}
- Customer Contact: ${data.customerContact}
- Items/Services:
${itemsList}
- Total Amount: £${data.totalAmount.toFixed(2)} GBP
- Collection/Booking Time Slot: ${data.collectionTimeSlot}
- Location: ${data.businessAddress} (in-store pickup or customer-specified for mobile services)

Please prepare the order and mark it as ready in the app when done – the customer will get notified automatically.

Manage this order here: ${data.manageOrderLink}

Thanks for being part of Localito – every order keeps Manchester's independents thriving!

Best regards,
Localito Marketplace Ltd
https://localito.com

---
Company Number: 16959163
© 2026 Localito Marketplace Ltd. All rights reserved.
`;
}

import { render } from '@react-email/render';
import OrderCollectionConfirmedEmail from './OrderCollectionConfirmed';
import * as React from 'react';

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface OrderCollectionConfirmedData {
  customerName: string;
  orderId: string;
  items: OrderItem[];
  totalAmount: number;
  cashbackAmount: number;
  newCashbackBalance: number;
  businessName: string;
}

/**
 * Renders the Order Collection Confirmed email template to HTML
 */
export async function renderOrderCollectionConfirmedEmail(
  data: OrderCollectionConfirmedData
): Promise<string> {
  const emailComponent = React.createElement(OrderCollectionConfirmedEmail, data);
  return await render(emailComponent);
}

/**
 * Renders the Order Collection Confirmed email template to plain text
 */
export function renderOrderCollectionConfirmedEmailText(
  data: OrderCollectionConfirmedData
): string {
  const itemsList = data.items
    .map((item) => `  - ${item.name}: ${item.quantity} × £${item.price.toFixed(2)}`)
    .join('\n');

  return `Dear ${data.customerName},

Your Localito Order Collection Confirmed – ${data.orderId}

Great news! Your order from ${data.businessName} has been successfully collected and confirmed via QR scan.

Receipt Summary:
- Order ID: ${data.orderId}
- Items:
${itemsList}
- Total Paid: £${data.totalAmount.toFixed(2)} GBP
- Cashback Credited: £${data.cashbackAmount.toFixed(2)} GBP (1% instant reward!)
- New Cashback Balance: £${data.newCashbackBalance.toFixed(2)} GBP (redeem on your next order)

Thank you for supporting Manchester's independents – your purchase keeps our communities thriving!

If everything looks good, we'd love a quick review in the app.

Happy shopping,
Localito Marketplace Ltd
https://localito.com

---
Company Number: 16959163
© 2026 Localito Marketplace Ltd. All rights reserved.
`;
}

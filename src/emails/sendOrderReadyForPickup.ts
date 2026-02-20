import { render } from '@react-email/render';
import OrderReadyForPickupEmail from './OrderReadyForPickup';
import * as React from 'react';

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface OrderReadyForPickupData {
  customerName: string;
  orderId: string;
  items: OrderItem[];
  totalAmount: number;
  cashbackAmount: number;
  businessName: string;
  businessAddress: string;
  openingHours: string;
  googleMapsLink?: string;
  qrCodeUrl?: string;
}

/**
 * Renders the Order Ready for Pickup email template to HTML
 */
export async function renderOrderReadyForPickupEmail(
  data: OrderReadyForPickupData
): Promise<string> {
  const emailComponent = React.createElement(OrderReadyForPickupEmail, data);
  return await render(emailComponent);
}

/**
 * Renders the Order Ready for Pickup email template to plain text
 */
export function renderOrderReadyForPickupEmailText(
  data: OrderReadyForPickupData
): string {
  const items = Array.isArray(data.items) ? data.items : [];
  const itemsList = items
    .map((item) => `  - ${item?.name ?? 'Item'}: ${item?.quantity ?? 1} × £${Number(item?.price ?? 0).toFixed(2)}`)
    .join('\n');

  return `Dear ${data.customerName},

Great news! Your order from ${data.businessName} is now ready for collection.

Order Details:
- Order ID: ${data.orderId}
- Items:
${itemsList}
- Total Amount: £${data.totalAmount.toFixed(2)}
- Cashback Earned: £${data.cashbackAmount.toFixed(2)} (redeem on your next order!)

Collection Reminder:
Head to ${data.businessName} at ${data.businessAddress} during ${data.openingHours}.${data.googleMapsLink ? `\n${data.googleMapsLink}` : ''}

${data.qrCodeUrl ? 'Simply show your QR code below for quick verification.' : ''}

If you can't make your confirmed time, please contact the business to reschedule.

Thanks for supporting your local business!

Best,
Localito Marketplace Ltd
hello@localito.com
https://localito.com

---
Company Number: 16959163
© 2026 Localito Marketplace Ltd. All rights reserved.
`;
}

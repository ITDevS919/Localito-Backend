import { render } from '@react-email/render';
import LowStockAlertEmail from './LowStockAlert';
import * as React from 'react';

export interface LowStockAlertData {
  businessOwnerName: string;
  businessName: string;
  productName: string;
  currentStockLevel: number;
  thresholdNumber: number;
  updateStockLink: string;
}

/**
 * Renders the Low Stock Alert email template to HTML
 */
export async function renderLowStockAlertEmail(
  data: LowStockAlertData
): Promise<string> {
  const emailComponent = React.createElement(LowStockAlertEmail, data);
  return await render(emailComponent);
}

/**
 * Renders the Low Stock Alert email template to plain text
 */
export function renderLowStockAlertEmailText(
  data: LowStockAlertData
): string {
  return `Dear ${data.businessOwnerName} / ${data.businessName} Team,

Low Stock Alert – ${data.productName} at ${data.businessName}

We've noticed one of your products is running low – time to restock!

Product Details:
- Product Name: ${data.productName}
- Current Stock Level: ${data.currentStockLevel} (below your threshold of ${data.thresholdNumber})

Update your stock now to avoid missing sales: ${data.updateStockLink}

Keeping inventory fresh keeps customers coming back! If you need help, please contact us at hello@localito.com.

Best regards,
Localito Marketplace Ltd
https://localito.com

---
Company Number: 16959163
© 2026 Localito Marketplace Ltd. All rights reserved.
`;
}

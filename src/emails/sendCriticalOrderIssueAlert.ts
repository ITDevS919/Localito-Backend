import { render } from '@react-email/render';
import CriticalOrderIssueAlertEmail from './CriticalOrderIssueAlert';
import * as React from 'react';

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface CriticalOrderIssueAlertData {
  orderId: string;
  customerName: string;
  businessName: string;
  items: OrderItem[];
  totalAmount: number;
  orderDate: string;
  currentStatus: string; // e.g., "Pending", "Disputed"
  specificIssue: string; // e.g., "Payment dispute, customer complaint..."
  additionalNotes?: string; // Optional extra details
  timeframe: string; // e.g., "24 hours"
  customerContactLink?: string; // Link to contact customer
  businessContactLink?: string; // Link to contact business
  adminDashboardLink: string; // Link to admin dashboard
}

/**
 * Renders the Critical Order Issue Alert email template to HTML
 */
export async function renderCriticalOrderIssueAlertEmail(
  data: CriticalOrderIssueAlertData
): Promise<string> {
  const emailComponent = React.createElement(CriticalOrderIssueAlertEmail, data);
  return await render(emailComponent);
}

/**
 * Renders the Critical Order Issue Alert email template to plain text
 */
export function renderCriticalOrderIssueAlertEmailText(
  data: CriticalOrderIssueAlertData
): string {
  const itemsList = data.items
    .map((item) => `  - ${item.name}: ${item.quantity} × £${item.price.toFixed(2)}`)
    .join('\n');

  let optionsList = '';
  if (data.customerContactLink) {
    optionsList += `- Contact customer: ${data.customerContactLink}\n`;
  }
  if (data.businessContactLink) {
    optionsList += `- Contact business: ${data.businessContactLink}\n`;
  }
  optionsList += `- Refund/Adjust order: ${data.adminDashboardLink}\n`;
  optionsList += `- Escalate if needed by replying to this email`;

  const notesSection = data.additionalNotes
    ? `Additional notes: ${data.additionalNotes}\n`
    : '';

  return `Dear Admin Team,

Critical Order Issue Alert – ${data.orderId} Needs Immediate Attention

We've detected a critical issue with an order on Localito that requires your review.

Order Info:
- Order ID: ${data.orderId}
- Customer Name: ${data.customerName}
- Business Name: ${data.businessName}
- Items/Services:
${itemsList}
- Total Amount: £${data.totalAmount.toFixed(2)} GBP
- Order Date: ${data.orderDate}
- Status: ${data.currentStatus}

Issue Details:
${data.specificIssue}
${notesSection}Action Required:
Please investigate and resolve within ${data.timeframe}. Options:
${optionsList}

Ensuring quick resolutions keeps our community trusting Localito.

Best regards,
Localito System Alert
Localito Marketplace Ltd
hello@localito.com
www.localito.com

---
Company Number: 16959163
© 2026 Localito Marketplace Ltd. All rights reserved.
`;
}

import { render } from '@react-email/render';
import BusinessWelcomeEmail from './BusinessWelcome';
import * as React from 'react';

export interface BusinessWelcomeData {
  businessOwnerName: string;
  businessName: string;
  verificationLink: string;
  dashboardLink: string;
}

/**
 * Renders the Business Welcome email template to HTML
 */
export async function renderBusinessWelcomeEmail(
  data: BusinessWelcomeData
): Promise<string> {
  const emailComponent = React.createElement(BusinessWelcomeEmail, data);
  return await render(emailComponent);
}

/**
 * Renders the Business Welcome email template to plain text
 */
export function renderBusinessWelcomeEmailText(
  data: BusinessWelcomeData
): string {
  return `Dear ${data.businessOwnerName} / ${data.businessName} Team,

Welcome to Localito – Let's Get Your Business Live!

We're thrilled to welcome you to Localito – Manchester's independents-only marketplace! You're now part of the movement reviving our high streets.

As a quick intro: Localito connects you directly with local customers. They browse your products/services, pay securely online, and collect in-store or receive at home. You get new footfall, and shoppers earn 1% instant cashback for repeats.

Onboarding Steps to Go Live:
1. Verify Your Account: Click here to confirm your email: ${data.verificationLink} (expires in 24 hours).
2. Set Up Your Profile: Log in to the dashboard ${data.dashboardLink} and add your business details (address, hours, logo, picture of your store (optional)).
3. Connect Payments: Link your Stripe account in 2 clicks for secure payouts.
4. List Your Products/Services: Head to the "Add Items" section – upload photos, descriptions, prices, and availability. It's simple:
   - Click "New Product/Service"
   - Enter name, price, details (e.g., haircut: £20, 45 mins)
   - Add images and set pickup/booking slots
   - Save and publish – live in minutes! (Aim for 5–10 of your best selling products/services to start)

You're on the free 30-day pilot – no commissions from us. We'll handle marketing to bring customers your way.

Need help? Reply to this email or contact support at hello@localito.com. We're here to help.

Let's make Manchester buzz again!

Best regards,
Localito Marketplace Ltd
https://localito.com

---
Company Number: 16959163
© 2026 Localito Marketplace Ltd. All rights reserved.
`;
}

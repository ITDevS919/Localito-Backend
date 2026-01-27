import { render } from '@react-email/render';
import WelcomeVerificationEmail from './WelcomeVerification';
import * as React from 'react';

export interface WelcomeVerificationData {
  userName: string;
  verificationLink: string;
}

/**
 * Renders the Welcome Verification email template to HTML
 */
export async function renderWelcomeVerificationEmail(
  data: WelcomeVerificationData
): Promise<string> {
  const emailComponent = React.createElement(WelcomeVerificationEmail, data);
  return await render(emailComponent);
}

/**
 * Renders the Welcome Verification email template to plain text
 */
export function renderWelcomeVerificationEmailText(
  data: WelcomeVerificationData
): string {
  return `Dear ${data.userName},

Welcome to Localito – Verify Your Account!

We're thrilled you've joined Localito – Manchester's independents-only marketplace! Discover local gems, pay online, pick up in-store, and earn 1% instant cashback.

***Unlock the Magic of Our Cashback Loop:***

Imagine getting rewarded for every local purchase – that's our instant cashback in action! It lands in your account right away, ready to redeem on your next adventure with a Manchester independent business. Picture this: Buy a hand-made gift from a quirky local store, earn back a bit, then treat yourself to a haircut from a stylist – all while keeping money flowing in our community. No waits, no gimmicks – just smart savings that loop back to support the places you love!

To get started, please verify your account by clicking the link below. This link will expire in 24 hours for security reasons:

${data.verificationLink}

If you didn't sign up, please ignore this email and contact us.

Excited to have you on board – let's support local together!

Localito Marketplace Ltd
www.localito.com

---
Company Number: 16959163
© 2026 Localito Marketplace Ltd. All rights reserved.
`;
}

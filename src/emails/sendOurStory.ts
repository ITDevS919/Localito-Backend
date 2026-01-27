import { render } from '@react-email/render';
import OurStoryEmail from './OurStory';
import * as React from 'react';

/**
 * Renders the Our Story email template to HTML
 */
export async function renderOurStoryEmail(recipientName?: string): Promise<string> {
  const emailComponent = React.createElement(OurStoryEmail, { recipientName });
  return await render(emailComponent);
}

/**
 * Renders the Our Story email template to plain text
 */
export function renderOurStoryEmailText(recipientName?: string): string {
  // Simple plain text version
  return `Dear ${recipientName || 'Friend'},

Our Story

In the heart of Manchester, where the buzz of the high street once defined community life, I watched something heartbreaking unfold. As a founder, with a passion for local businesses and community spirit, I've seen too many "To Let" signs replace vibrant shop fronts.

Manchester's retail history runs deep: from markets granted by William the Conqueror in 1066, to the Victorian "Cottonopolis" era producing 80% of the world's cotton, and the birthplace of iconic department stores like Kendals (tracing origins to 1832, the UK's oldest) and Lewis's (founded 1856). The 1970s Arndale Centre, built for £100 million, marked a new chapter in modern retail. But fast forward to today: in 2025, the UK lost over 13,000 retail stores—84% independents, the true soul of our neighbourhoods. 2026 is forecasted to be no different unless we work together to change the "status quo".

That frustration sparked Localito. I couldn't stand by while independent shops, boutiques, market stalls, and service providers—like those from the beauty industry, teachers, therapists, personal trainers and those who look after our pets—struggled to compete. They didn't need another generic marketplace crowded with chains. They needed a platform built for them: one that celebrates their uniqueness, drives footfall back to their doors, and keeps money circulating locally.

Starting small, I bootstrapped the platform personally with a team of talented developers. It wasn't glamorous—late nights, endless iterations—but it works and we have so much more planned for the very near future. We created an app where shoppers discover real local gems, pay securely online, and collect in-store or book services with local pros all within the app. No delivery fees, no packaging waste—just eco-friendly convenience. And the game-changer? A 1% instant cashback loop that rewards every purchase, redeemable right away on the next local buy, creating a cycle of loyalty that benefits everyone.

In January 2026, Localito Marketplace Ltd was officially registered on Companies House (company number 16959163), turning my vision into reality. The response has been overwhelming: over 300 Manchester independents joined our waitlist in weeks, from convenience stores, florists and beauty industry experts to quirky boutiques and even dog groomers. They're not just signing up—they're excited to fight back!

But this is bigger than Manchester. As we expand to London and beyond, Localito aims to revive high streets nationwide. We're not just an app; we're a movement. One that empowers independents with free trials, handles their marketing (social, Google Ads, radio, buses), and gives shoppers a reason to choose local every time. Independents finally have an online platform that increases footfall (instead of reducing it) and shoppers have a convenient way to support their local business from the comfort of their own home - whilst being rewarded for doing so!

The future looks brighter because of people like you—those who believe in community over faceless warehouses.

Join us: businesses, claim your free pilot spot; shoppers, sign up to be first in line. Together, let's bring the high street back to life and support your local business!

- Lee Berrow, Founder

---
Localito Marketplace Ltd
Company Number: 16959163
Visit: https://localito.com
`;
}

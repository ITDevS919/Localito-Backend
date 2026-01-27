import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Img,
  Link,
  Hr,
} from '@react-email/components';
import * as React from 'react';
import { EMAIL_LOGO_URL } from './constants';

interface OurStoryEmailProps {
  recipientName?: string;
}

export default function OurStoryEmail({ recipientName = 'Friend' }: OurStoryEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          {/* Header with Logo */}
          <Section style={header}>
            <Img
              src={EMAIL_LOGO_URL}
              width="200"
              height="auto"
              alt="Localito"
              style={logo}
            />
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Text style={greeting}>Dear {recipientName},</Text>
            
            <Text style={heading}>Our Story</Text>

            <Text style={paragraph}>
              In the heart of Manchester, where the buzz of the high street once defined
              community life, I watched something heartbreaking unfold. As a founder, with
              a passion for local businesses and community spirit, I've seen too many "To
              Let" signs replace vibrant shop fronts.
            </Text>

            <Text style={paragraph}>
              Manchester's retail history runs deep: from markets granted by William the Conqueror in 1066, 
              to the Victorian "Cottonopolis" era producing 80% of the world's cotton, and the birthplace of
              iconic department stores like Kendals (tracing origins to 1832, the UK's oldest) and Lewis's 
              (founded 1856). The 1970s Arndale Centre, built for £100 million, marked a new chapter in 
              modern retail. But fast forward to today: in 2025, the UK lost over 13,000 retail stores—84% 
              independents, the true soul of our neighbourhoods. 2026 is forecasted to be no different 
              unless we work together to change the "status quo".
            </Text>

            <Text style={paragraph}>
              That frustration sparked Localito. I couldn't stand by while independent shops,
              boutiques, market stalls, and service providers—like those from the beauty
              industry, teachers, therapists, personal trainers and those who look after our
              pets—struggled to compete. They didn't need another generic marketplace
              crowded with chains. They needed a platform built for them: one that
              celebrates their uniqueness, drives footfall back to their doors, and keeps
              money circulating locally.
            </Text>

            <Text style={paragraph}>
              Starting small, I bootstrapped the platform personally with a team of talented
              developers. It wasn't glamorous—late nights, endless iterations—but it works
              and we have so much more planned for the very near future. We created an
              app where shoppers discover real local gems, pay securely online, and collect
              in-store or book services with local pros all within the app. No delivery fees, no
              packaging waste—just eco-friendly convenience. And the game-changer? A 1%
              instant cashback loop that rewards every purchase, redeemable right away on
              the next local buy, creating a cycle of loyalty that benefits everyone.
            </Text>

            <Text style={paragraph}>
              In January 2026, Localito Marketplace Ltd was officially registered on
              Companies House (company number 16959163), turning my vision into reality.
              The response has been overwhelming: over 300 Manchester independents
              joined our waitlist in weeks, from convenience stores, florists and beauty
              industry experts to quirky boutiques and even dog groomers. They're not just
              signing up—they're excited to fight back!
            </Text>

            <Text style={paragraph}>
              But this is bigger than Manchester. As we expand to London and beyond,
              Localito aims to revive high streets nationwide. We're not just an app; we're a
              movement. One that empowers independents with free trials, handles their
              marketing (social, Google Ads, radio, buses), and gives shoppers a reason to
              choose local every time. Independents finally have an online platform that
              increases footfall (instead of reducing it) and shoppers have a convenient way
              to support their local business from the comfort of their own home - whilst
              being rewarded for doing so!
            </Text>

            <Text style={paragraph}>
              The future looks brighter because of people like you—those who believe in
              community over faceless warehouses.
            </Text>

            <Text style={callToActionText}>
              Join us: businesses, claim your free pilot spot; shoppers, sign up to be first in line.
              Together, let's bring the high street back to life and support your local business!
            </Text>

            <Section style={buttonSection}>
              <Button style={primaryButton} href="https://localito.com/businesses">
                Join as a Business
              </Button>
              <Button style={secondaryButton} href="https://localito.com/signup">
                Sign Up as a Shopper
              </Button>
            </Section>

            <Text style={signature}>
              - Lee Berrow, Founder
            </Text>
          </Section>

          {/* Footer */}
          <Hr style={divider} />
          <Section style={footer}>
            <Text style={footerText}>
              <strong>Localito Marketplace Ltd</strong>
            </Text>
            <Text style={footerText}>
              Company Number: 16959163
            </Text>
            <Text style={footerText}>
              <Link href="https://localito.com" style={footerLink}>Visit Localito</Link> | 
              <Link href="https://localito.com/privacy" style={footerLink}> Privacy Policy</Link> | 
              <Link href="https://localito.com/terms" style={footerLink}> Terms</Link>
            </Text>
            <Text style={footerText}>
              <Link href="https://localito.com/unsubscribe" style={footerLink}>Unsubscribe</Link>
            </Text>
            <Text style={footerSmall}>
              © 2026 Localito Marketplace Ltd. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Styles using Localito brand colors
const main = {
  backgroundColor: '#FAFBFC',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '0',
  maxWidth: '600px',
  borderRadius: '8px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
};

const header = {
  padding: '32px 24px 24px',
  backgroundColor: '#ffffff',
  textAlign: 'center' as const,
  borderTopLeftRadius: '8px',
  borderTopRightRadius: '8px',
};

const logo = {
  margin: '0 auto',
  display: 'block',
};

const content = {
  padding: '32px 24px',
};

const greeting = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0 0 24px',
};

const heading = {
  fontSize: '32px',
  lineHeight: '1.2',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 24px',
  textAlign: 'center' as const,
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '1.7',
  color: '#1a2e4a',
  margin: '0 0 20px',
  textAlign: 'left' as const,
};

const callToActionText = {
  fontSize: '18px',
  lineHeight: '1.6',
  color: '#094b9e',
  fontWeight: '600',
  margin: '32px 0 24px',
  textAlign: 'center' as const,
};

const buttonSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const primaryButton = {
  backgroundColor: '#094b9e',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 32px',
  margin: '8px',
  minWidth: '180px',
};

const secondaryButton = {
  backgroundColor: '#FFA500',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 32px',
  margin: '8px',
  minWidth: '180px',
};

const signature = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '32px 0 0',
  fontStyle: 'italic',
  textAlign: 'left' as const,
};

const divider = {
  borderColor: '#e2e8f0',
  margin: '32px 24px',
};

const footer = {
  padding: '24px',
  backgroundColor: '#FAFBFC',
  textAlign: 'center' as const,
  borderBottomLeftRadius: '8px',
  borderBottomRightRadius: '8px',
};

const footerText = {
  fontSize: '13px',
  lineHeight: '1.6',
  color: '#64748b',
  margin: '0 0 8px',
  textAlign: 'center' as const,
};

const footerLink = {
  color: '#094b9e',
  textDecoration: 'underline',
  margin: '0 4px',
};

const footerSmall = {
  fontSize: '11px',
  lineHeight: '1.5',
  color: '#64748b',
  margin: '16px 0 0',
  textAlign: 'center' as const,
};

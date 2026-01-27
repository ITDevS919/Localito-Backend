import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Img,
  Link,
  Hr,
  Button,
} from '@react-email/components';
import * as React from 'react';
import { EMAIL_LOGO_URL } from './constants';

interface BusinessWelcomeEmailProps {
  businessOwnerName: string;
  businessName: string;
  verificationLink: string;
  dashboardLink: string;
}

export default function BusinessWelcomeEmail({
  businessOwnerName,
  businessName,
  verificationLink,
  dashboardLink,
}: BusinessWelcomeEmailProps) {
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
            <Text style={greeting}>Dear {businessOwnerName} / {businessName} Team,</Text>
            
            <Text style={heading}>Welcome to Localito – Let's Get Your Business Live! 🎉</Text>

            <Text style={paragraph}>
              We're thrilled to welcome you to Localito – Manchester's independents-only
              marketplace! You're now part of the movement reviving our high streets.
            </Text>

            {/* Introduction Box */}
            <Section style={introBox}>
              <Text style={introTitle}>Quick Intro</Text>
              <Text style={introText}>
                Localito connects you directly with local customers. They browse your
                products/services, pay securely online, and collect in-store or receive at home.
                You get new footfall, and shoppers earn <strong>1% instant cashback</strong> for
                repeats.
              </Text>
            </Section>

            {/* Onboarding Steps */}
            <Section style={stepsBox}>
              <Text style={stepsTitle}>Onboarding Steps to Go Live:</Text>

              {/* Step 1 */}
              <Section style={stepBox}>
                <Text style={stepNumber}>1.</Text>
                <Text style={stepTitle}>Verify Your Account</Text>
                <Text style={stepText}>
                  Click here to confirm your email (expires in <strong>24 hours</strong>).
                </Text>
                <Section style={stepCtaSection}>
                  <Button style={stepButton} href={verificationLink}>
                    Verify Email
                  </Button>
                </Section>
              </Section>

              {/* Step 2 */}
              <Section style={stepBox}>
                <Text style={stepNumber}>2.</Text>
                <Text style={stepTitle}>Set Up Your Profile</Text>
                <Text style={stepText}>
                  Log in to the dashboard and add your business details (address, hours, logo,
                  picture of your store (optional)).
                </Text>
                <Section style={stepCtaSection}>
                  <Button style={stepButton} href={dashboardLink}>
                    Go to Dashboard
                  </Button>
                </Section>
              </Section>

              {/* Step 3 */}
              <Section style={stepBox}>
                <Text style={stepNumber}>3.</Text>
                <Text style={stepTitle}>Connect Payments</Text>
                <Text style={stepText}>
                  Link your Stripe account in <strong>2 clicks</strong> for secure payouts.
                </Text>
              </Section>

              {/* Step 4 */}
              <Section style={stepBox}>
                <Text style={stepNumber}>4.</Text>
                <Text style={stepTitle}>List Your Products/Services</Text>
                <Text style={stepText}>
                  Head to the "Add Items" section – upload photos, descriptions, prices, and
                  availability. It's simple:
                </Text>
                <Section style={subStepsBox}>
                  <Text style={subStepItem}>
                    • Click "New Product/Service"
                  </Text>
                  <Text style={subStepItem}>
                    • Enter name, price, details (e.g., haircut: £20, 45 mins)
                  </Text>
                  <Text style={subStepItem}>
                    • Add images and set pickup/booking slots
                  </Text>
                  <Text style={subStepItem}>
                    • Save and publish – live in minutes!
                  </Text>
                </Section>
                <Text style={stepNote}>
                  (Aim for <strong>5–10 of your best selling products/services</strong> to start)
                </Text>
              </Section>
            </Section>

            {/* Free Pilot Notice */}
            <Section style={pilotBox}>
              <Text style={pilotTitle}>Free 30-Day Pilot</Text>
              <Text style={pilotText}>
                You're on the <strong>free 30-day pilot</strong> – no commissions from us. We'll
                handle marketing to bring customers your way.
              </Text>
            </Section>

            {/* Help Section */}
            <Section style={helpBox}>
              <Text style={helpText}>
                Need help? Reply to this email or contact support at{' '}
                <Link href="mailto:hello@localito.com" style={linkStyle}>
                  hello@localito.com
                </Link>
                . We're here to help.
              </Text>
            </Section>

            <Text style={closingText}>
              Let's make Manchester buzz again! 💙
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
              Email: <Link href="mailto:hello@localito.com" style={footerLink}>hello@localito.com</Link>
            </Text>
            <Text style={footerText}>
              <Link href="https://localito.com" style={footerLink}>Visit Localito</Link> | 
              <Link href="https://localito.com/privacy" style={footerLink}> Privacy Policy</Link> | 
              <Link href="https://localito.com/terms" style={footerLink}> Terms</Link>
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
  fontSize: '24px',
  lineHeight: '1.3',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 20px',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0 0 24px',
};

const introBox = {
  backgroundColor: '#E6F4FE',
  border: '2px solid #094b9e',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const introTitle = {
  fontSize: '18px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 12px',
};

const introText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0',
};

const stepsBox = {
  backgroundColor: '#FAFBFC',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '24px',
  margin: '24px 0',
};

const stepsTitle = {
  fontSize: '20px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 20px',
};

const stepBox = {
  marginBottom: '24px',
  paddingBottom: '24px',
  borderBottom: '1px solid #e2e8f0',
};

const stepNumber = {
  fontSize: '24px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 8px',
  display: 'inline-block',
  width: '32px',
};

const stepTitle = {
  fontSize: '18px',
  fontWeight: '700',
  color: '#1a2e4a',
  margin: '0 0 8px',
  display: 'inline-block',
  width: 'calc(100% - 40px)',
  verticalAlign: 'top',
};

const stepText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '8px 0 12px',
  paddingLeft: '40px',
};

const subStepsBox = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  padding: '16px',
  margin: '12px 0 12px 40px',
};

const subStepItem = {
  fontSize: '15px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0 0 8px',
};

const stepNote = {
  fontSize: '14px',
  lineHeight: '1.6',
  color: '#64748b',
  margin: '12px 0 0',
  paddingLeft: '40px',
  fontStyle: 'italic',
};

const stepCtaSection = {
  textAlign: 'left' as const,
  margin: '12px 0 0',
  paddingLeft: '40px',
};

const stepButton = {
  backgroundColor: '#094b9e',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
};

const pilotBox = {
  backgroundColor: '#FFF4E6',
  border: '2px solid #FFA500',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const pilotTitle = {
  fontSize: '18px',
  fontWeight: '700',
  color: '#1a2e4a',
  margin: '0 0 12px',
};

const pilotText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0',
};

const helpBox = {
  backgroundColor: '#FAFBFC',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '16px',
  margin: '24px 0',
  textAlign: 'center' as const,
};

const helpText = {
  fontSize: '15px',
  lineHeight: '1.6',
  color: '#64748b',
  margin: '0',
};

const linkStyle = {
  color: '#094b9e',
  textDecoration: 'underline',
};

const closingText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#094b9e',
  fontWeight: '600',
  margin: '32px 0 0',
  textAlign: 'center' as const,
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

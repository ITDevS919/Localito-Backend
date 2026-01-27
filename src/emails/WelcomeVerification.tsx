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

interface WelcomeVerificationEmailProps {
  userName: string;
  verificationLink: string;
}

export default function WelcomeVerificationEmail({
  userName,
  verificationLink,
}: WelcomeVerificationEmailProps) {
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
            <Text style={greeting}>Dear {userName},</Text>
            
            <Text style={heading}>Welcome to Localito – Verify Your Account! 🎉</Text>

            <Text style={paragraph}>
              We're thrilled you've joined Localito – Manchester's independents-only
              marketplace! Discover local gems, pay online, pick up in-store, and earn <strong>1%
              instant cashback</strong>.
            </Text>

            {/* Cashback Loop Section */}
            <Section style={cashbackBox}>
              <Text style={cashbackTitle}>🌟 Unlock the Magic of Our Cashback Loop</Text>
              <Text style={cashbackText}>
                Imagine getting rewarded for every local purchase – that's our instant
                cashback in action! It lands in your account right away, ready to redeem on
                your next adventure with a Manchester independent business.
              </Text>
              <Text style={cashbackExample}>
                Picture this: Buy a hand-made gift from a quirky local store, earn back a bit, then treat
                yourself to a haircut from a stylist – all while keeping money flowing in our
                community. No waits, no gimmicks – just smart savings that loop back to
                support the places you love!
              </Text>
            </Section>

            {/* Verification Instructions */}
            <Text style={instructionsText}>
              To get started, please verify your account by clicking the link below. This link
              will expire in <strong>24 hours</strong> for security reasons:
            </Text>

            {/* Verification Button */}
            <Section style={ctaSection}>
              <Button style={verifyButton} href={verificationLink}>
                Verify My Account
              </Button>
            </Section>

            {/* Alternative Link */}
            <Section style={linkSection}>
              <Text style={linkText}>
                Or copy and paste this link into your browser:
              </Text>
              <Text style={linkUrl}>
                {verificationLink}
              </Text>
            </Section>

            {/* Security Notice */}
            <Section style={securityBox}>
              <Text style={securityText}>
                If you didn't sign up, please ignore this email and contact us.
              </Text>
            </Section>

            <Text style={closingText}>
              Excited to have you on board – let's support local together! 💙
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

const cashbackBox = {
  backgroundColor: '#E6F4FE',
  border: '2px solid #094b9e',
  borderRadius: '8px',
  padding: '24px',
  margin: '24px 0',
};

const cashbackTitle = {
  fontSize: '20px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 16px',
  textAlign: 'center' as const,
};

const cashbackText = {
  fontSize: '16px',
  lineHeight: '1.7',
  color: '#1a2e4a',
  margin: '0 0 16px',
};

const cashbackExample = {
  fontSize: '15px',
  lineHeight: '1.7',
  color: '#1a2e4a',
  fontStyle: 'italic',
  margin: '0',
  paddingLeft: '16px',
  borderLeft: '3px solid #FFA500',
};

const instructionsText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '32px 0 24px',
};

const ctaSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const verifyButton = {
  backgroundColor: '#094b9e',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '18px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '16px 40px',
  minWidth: '200px',
};

const linkSection = {
  backgroundColor: '#FAFBFC',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const linkText = {
  fontSize: '14px',
  color: '#64748b',
  margin: '0 0 12px',
};

const linkUrl = {
  fontSize: '13px',
  color: '#094b9e',
  wordBreak: 'break-all' as const,
  fontFamily: 'monospace',
  margin: '0',
};

const securityBox = {
  backgroundColor: '#FAFBFC',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '16px',
  margin: '24px 0',
  textAlign: 'center' as const,
};

const securityText = {
  fontSize: '14px',
  lineHeight: '1.6',
  color: '#64748b',
  margin: '0',
  fontStyle: 'italic',
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

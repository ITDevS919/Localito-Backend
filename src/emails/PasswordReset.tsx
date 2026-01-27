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

interface PasswordResetEmailProps {
  userName: string;
  resetLink: string;
  helpCenterLink?: string;
}

export default function PasswordResetEmail({
  userName,
  resetLink,
  helpCenterLink = 'https://localito.com/help',
}: PasswordResetEmailProps) {
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
            
            <Text style={heading}>Reset Your Localito Password</Text>

            <Text style={paragraph}>
              We've received a request to reset your Localito password. If this wasn't you,
              please ignore this email and contact us immediately for security.
            </Text>

            {/* Security Notice */}
            <Section style={securityBox}>
              <Text style={securityTitle}>🔒 Security Notice</Text>
              <Text style={securityText}>
                If you didn't request a password reset, please contact us immediately at{' '}
                <Link href="mailto:security@localito.com" style={securityLink}>
                  security@localito.com
                </Link>
              </Text>
            </Section>

            {/* Reset Instructions */}
            <Text style={instructionsText}>
              To reset your password, click the link below. This link will expire in <strong>1 hour</strong> for
              your protection:
            </Text>

            {/* Reset Button */}
            <Section style={ctaSection}>
              <Button style={resetButton} href={resetLink}>
                Reset My Password
              </Button>
            </Section>

            {/* Alternative Link */}
            <Section style={linkSection}>
              <Text style={linkText}>
                Or copy and paste this link into your browser:
              </Text>
              <Text style={linkUrl}>
                {resetLink}
              </Text>
            </Section>

            {/* Help Section */}
            <Section style={helpBox}>
              <Text style={helpText}>
                If you need help, reply to this email or visit our{' '}
                <Link href={helpCenterLink} style={helpLink}>
                  help centre
                </Link>.
              </Text>
            </Section>

            <Text style={closingText}>
              Stay safe and keep shopping local! 💙
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
            <Text style={footerSecurity}>
              <strong>Security:</strong> Never share your password reset link with anyone. 
              Localito staff will never ask for your password.
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

const securityBox = {
  backgroundColor: '#FEF2F2',
  border: '2px solid #ef4444',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const securityTitle = {
  fontSize: '18px',
  fontWeight: '700',
  color: '#ef4444',
  margin: '0 0 12px',
};

const securityText = {
  fontSize: '15px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0',
};

const securityLink = {
  color: '#ef4444',
  textDecoration: 'underline',
  fontWeight: '600',
};

const instructionsText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '24px 0',
};

const ctaSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const resetButton = {
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

const helpBox = {
  backgroundColor: '#E6F4FE',
  border: '1px solid #094b9e',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const helpText = {
  fontSize: '15px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0',
  textAlign: 'center' as const,
};

const helpLink = {
  color: '#094b9e',
  textDecoration: 'underline',
  fontWeight: '600',
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

const footerSecurity = {
  fontSize: '12px',
  lineHeight: '1.5',
  color: '#64748b',
  margin: '16px 0 8px',
  textAlign: 'center' as const,
  fontStyle: 'italic',
};

const footerSmall = {
  fontSize: '11px',
  lineHeight: '1.5',
  color: '#64748b',
  margin: '16px 0 0',
  textAlign: 'center' as const,
};

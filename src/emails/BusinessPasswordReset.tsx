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

interface BusinessPasswordResetEmailProps {
  businessOwnerName: string;
  resetLink: string;
  helpCenterLink?: string;
}

export default function BusinessPasswordResetEmail({
  businessOwnerName,
  resetLink,
  helpCenterLink,
}: BusinessPasswordResetEmailProps) {
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
            <Text style={greeting}>Dear {businessOwnerName},</Text>
            
            <Text style={heading}>Reset Your Business Password</Text>

            <Text style={paragraph}>
              We've received a request to reset the password for your Localito business
              account. If this wasn't you, please ignore this email and contact us
              immediately for security reasons.
            </Text>

            {/* Security Notice */}
            <Section style={securityBox}>
              <Text style={securityText}>
                <strong>Security Notice:</strong> If you didn't request this password reset,
                please contact us immediately at{' '}
                <Link href="mailto:hello@localito.com" style={linkStyle}>
                  hello@localito.com
                </Link>
              </Text>
            </Section>

            {/* Reset Button */}
            <Section style={ctaSection}>
              <Button style={resetButton} href={resetLink}>
                Reset Your Password
              </Button>
            </Section>

            {/* Alternative Link */}
            <Text style={alternativeText}>
              Or copy and paste this link into your browser:
            </Text>
            <Text style={linkText}>{resetLink}</Text>

            {/* Expiration Notice */}
            <Section style={expirationBox}>
              <Text style={expirationText}>
                <strong>Important:</strong> This link will expire in <strong>1 hour</strong> for your protection.
              </Text>
            </Section>

            {/* Help Section */}
            {helpCenterLink && (
              <Section style={helpBox}>
                <Text style={helpText}>
                  Need further assistance?{' '}
                  <Link href={helpCenterLink} style={linkStyle}>
                    Visit our help center
                  </Link>{' '}
                  or reply to this email.
                </Text>
              </Section>
            )}

            {!helpCenterLink && (
              <Text style={helpText}>
                If you need further assistance, please contact us at{' '}
                <Link href="mailto:hello@localito.com" style={linkStyle}>
                  hello@localito.com
                </Link>
              </Text>
            )}

            <Text style={closingText}>
              Stay secure and keep thriving on Localito! 💙
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

const securityBox = {
  backgroundColor: '#FFF4E6',
  border: '2px solid #FFA500',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const securityText = {
  fontSize: '15px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0',
  textAlign: 'center' as const,
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

const alternativeText = {
  fontSize: '14px',
  lineHeight: '1.6',
  color: '#64748b',
  margin: '24px 0 8px',
  textAlign: 'center' as const,
};

const linkText = {
  fontSize: '13px',
  lineHeight: '1.6',
  color: '#094b9e',
  margin: '0 0 24px',
  textAlign: 'center' as const,
  wordBreak: 'break-all' as const,
  padding: '12px',
  backgroundColor: '#FAFBFC',
  borderRadius: '4px',
};

const expirationBox = {
  backgroundColor: '#E6F4FE',
  border: '2px solid #094b9e',
  borderRadius: '8px',
  padding: '16px',
  margin: '24px 0',
  textAlign: 'center' as const,
};

const expirationText = {
  fontSize: '15px',
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
  margin: '24px 0 0',
  textAlign: 'center' as const,
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

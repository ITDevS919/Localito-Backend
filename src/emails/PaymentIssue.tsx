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

interface PaymentIssueEmailProps {
  customerName: string;
  orderId: string;
  businessName: string;
  reason: string; // e.g., "Insufficient funds, Card expired, or Payment gateway error"
  appLink: string; // Link to app
  reservationPeriod: string; // e.g., "24 hours"
}

export default function PaymentIssueEmail({
  customerName,
  orderId,
  businessName,
  reason,
  appLink,
  reservationPeriod,
}: PaymentIssueEmailProps) {
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
            <Text style={greeting}>Dear {customerName},</Text>
            
            <Text style={heading}>Payment Issue with Your Order</Text>

            <Text style={paragraph}>
              We're sorry, but your payment for Order <strong>{orderId}</strong> from{' '}
              <strong>{businessName}</strong> has failed.
            </Text>

            {/* Reason Box */}
            <Section style={reasonBox}>
              <Text style={reasonTitle}>Reason:</Text>
              <Text style={reasonText}>{reason}</Text>
              <Text style={reasonNote}>
                Please check with your bank if needed.
              </Text>
            </Section>

            {/* Retry Instructions */}
            <Section style={instructionsBox}>
              <Text style={instructionsTitle}>Retry Instructions:</Text>
              
              <Text style={instructionItem}>
                1. Log back into the app using the link below
              </Text>
              
              <Text style={instructionItem}>
                2. Go to your cart or pending order and try paying again with a different card
                or method
              </Text>
              
              <Text style={instructionItem}>
                3. If the issue persists, contact your bank or reply to this email for help – we're
                here to assist
              </Text>
            </Section>

            {/* App Link Button */}
            <Section style={ctaSection}>
              <Button style={appButton} href={appLink}>
                Go to App
              </Button>
            </Section>

            {/* Reservation Notice */}
            <Section style={reservationBox}>
              <Text style={reservationText}>
                <strong>Good news:</strong> Your items are still reserved for{' '}
                <strong>{reservationPeriod}</strong>. Don't miss out on supporting your local business!
              </Text>
            </Section>

            {/* Help Section */}
            <Section style={helpBox}>
              <Text style={helpText}>
                Need assistance? Reply to this email or contact us at{' '}
                <Link href="mailto:hello@localito.com" style={linkStyle}>
                  hello@localito.com
                </Link>
                . We're here to help.
              </Text>
            </Section>
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

const reasonBox = {
  backgroundColor: '#FFF4E6',
  border: '2px solid #FFA500',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const reasonTitle = {
  fontSize: '18px',
  fontWeight: '700',
  color: '#1a2e4a',
  margin: '0 0 12px',
};

const reasonText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0 0 8px',
};

const reasonNote = {
  fontSize: '14px',
  lineHeight: '1.6',
  color: '#64748b',
  margin: '8px 0 0',
  fontStyle: 'italic',
};

const instructionsBox = {
  backgroundColor: '#E6F4FE',
  border: '2px solid #094b9e',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const instructionsTitle = {
  fontSize: '18px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 16px',
};

const instructionItem = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0 0 12px',
  paddingLeft: '8px',
};

const ctaSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const appButton = {
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

const reservationBox = {
  backgroundColor: '#E6F4FE',
  border: '2px solid #094b9e',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
  textAlign: 'center' as const,
};

const reservationText = {
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

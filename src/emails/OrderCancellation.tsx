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
} from '@react-email/components';
import * as React from 'react';
import { EMAIL_LOGO_URL } from './constants';

interface OrderCancellationEmailProps {
  customerName: string;
  orderId: string;
  businessName: string;
  refundAmount: number;
  cancellationReason?: string;
  isRefunded: boolean; // true if refunded, false if just cancelled
}

export default function OrderCancellationEmail({
  customerName,
  orderId,
  businessName,
  refundAmount,
  cancellationReason,
  isRefunded,
}: OrderCancellationEmailProps) {
  const cancellationText = isRefunded 
    ? 'has been successfully cancelled and refunded'
    : 'has been successfully cancelled';
  
  const reasonText = cancellationReason 
    ? `due to ${cancellationReason}`
    : 'at your request';

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
            
            <Text style={heading}>Your Order Cancellation Confirmation</Text>

            <Text style={paragraph}>
              We're sorry to see your order from <strong>{businessName}</strong> has been cancelled. Here's
              what you need to know:
            </Text>

            {/* Cancellation Notice */}
            <Section style={noticeBox}>
              <Text style={noticeTitle}>Cancellation Notice</Text>
              <Text style={noticeText}>
                Your order <strong>{orderId}</strong> {cancellationText} {reasonText}.
              </Text>
            </Section>

            {/* Refund Amount */}
            {isRefunded && (
              <Section style={refundBox}>
                <Text style={refundTitle}>Refund Amount</Text>
                <Text style={refundAmountText}>£{refundAmount.toFixed(2)}</Text>
                <Text style={refundNote}>
                  We'll refund the full amount back to your original payment method.
                </Text>
              </Section>
            )}

            {/* Refund Timeline */}
            {isRefunded && (
              <Section style={timelineBox}>
                <Text style={timelineTitle}>Refund Timeline</Text>
                <Text style={timelineText}>
                  Refunds typically process within <strong>3–5 business days</strong>, depending on your bank
                  or card provider. You'll receive a confirmation email once complete.
                </Text>
              </Section>
            )}

            {/* Security Notice */}
            <Section style={securityBox}>
              <Text style={securityText}>
                If this cancellation wasn't requested by you, or if you have any questions,
                please reply to this email right away.
              </Text>
            </Section>

            <Text style={closingText}>
              Thank you for supporting Manchester's independents – we hope to see you
              back soon! 💙
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

const noticeBox = {
  backgroundColor: '#FAFBFC',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '24px',
  margin: '24px 0',
};

const noticeTitle = {
  fontSize: '20px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 12px',
};

const noticeText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0',
};

const refundBox = {
  backgroundColor: '#E6F4FE',
  border: '2px solid #094b9e',
  borderRadius: '8px',
  padding: '24px',
  margin: '24px 0',
  textAlign: 'center' as const,
};

const refundTitle = {
  fontSize: '18px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 12px',
};

const refundAmountText = {
  fontSize: '32px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 12px',
};

const refundNote = {
  fontSize: '15px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0',
};

const timelineBox = {
  backgroundColor: '#FFF4E6',
  border: '2px solid #FFA500',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const timelineTitle = {
  fontSize: '18px',
  fontWeight: '700',
  color: '#1a2e4a',
  margin: '0 0 12px',
};

const timelineText = {
  fontSize: '15px',
  lineHeight: '1.6',
  color: '#1a2e4a',
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

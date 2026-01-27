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

interface LowStockAlertEmailProps {
  businessOwnerName: string;
  businessName: string;
  productName: string;
  currentStockLevel: number;
  thresholdNumber: number;
  updateStockLink: string;
}

export default function LowStockAlertEmail({
  businessOwnerName,
  businessName,
  productName,
  currentStockLevel,
  thresholdNumber,
  updateStockLink,
}: LowStockAlertEmailProps) {
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
            
            <Text style={heading}>Low Stock Alert ⚠️</Text>

            <Text style={paragraph}>
              We've noticed one of your products is running low – time to restock!
            </Text>

            {/* Product Details Section */}
            <Section style={productBox}>
              <Text style={productBoxTitle}>Product Details</Text>
              
              <Text style={productNameText}>
                <strong>Product Name:</strong> {productName}
              </Text>

              <Section style={stockAlertBox}>
                <Text style={stockLabel}>Current Stock Level</Text>
                <Text style={stockValue}>{currentStockLevel}</Text>
                <Text style={stockNote}>
                  (below your threshold of {thresholdNumber})
                </Text>
              </Section>
            </Section>

            {/* Action Section */}
            <Section style={actionBox}>
              <Text style={actionText}>
                Update your stock now to avoid missing sales!
              </Text>
            </Section>

            {/* Update Stock Button */}
            <Section style={ctaSection}>
              <Button style={updateButton} href={updateStockLink}>
                Update Stock
              </Button>
            </Section>

            {/* Reminder */}
            <Section style={reminderBox}>
              <Text style={reminderText}>
                Keeping inventory fresh keeps customers coming back! If you need help,
                please contact us at{' '}
                <Link href="mailto:hello@localito.com" style={linkStyle}>
                  hello@localito.com
                </Link>
                .
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

const productBox = {
  backgroundColor: '#FAFBFC',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '24px',
  margin: '24px 0',
};

const productBoxTitle = {
  fontSize: '20px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 16px',
};

const productNameText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0 0 20px',
};

const stockAlertBox = {
  backgroundColor: '#FFF4E6',
  border: '2px solid #FFA500',
  borderRadius: '8px',
  padding: '20px',
  margin: '16px 0 0',
  textAlign: 'center' as const,
};

const stockLabel = {
  fontSize: '16px',
  fontWeight: '600',
  color: '#1a2e4a',
  margin: '0 0 8px',
};

const stockValue = {
  fontSize: '32px',
  fontWeight: '700',
  color: '#FFA500',
  margin: '0 0 8px',
};

const stockNote = {
  fontSize: '14px',
  color: '#64748b',
  margin: '0',
  fontStyle: 'italic',
};

const actionBox = {
  backgroundColor: '#E6F4FE',
  border: '2px solid #094b9e',
  borderRadius: '8px',
  padding: '16px',
  margin: '24px 0',
  textAlign: 'center' as const,
};

const actionText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0',
  fontWeight: '600',
};

const ctaSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const updateButton = {
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

const reminderBox = {
  backgroundColor: '#FAFBFC',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '16px',
  margin: '24px 0',
  textAlign: 'center' as const,
};

const reminderText = {
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

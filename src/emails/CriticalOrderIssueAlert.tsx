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
  Row,
  Column,
  Button,
} from '@react-email/components';
import * as React from 'react';
import { EMAIL_LOGO_URL } from './constants';

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

interface CriticalOrderIssueAlertEmailProps {
  orderId: string;
  customerName: string;
  businessName: string;
  items: OrderItem[];
  totalAmount: number;
  orderDate: string;
  currentStatus: string; // e.g., "Pending", "Disputed"
  specificIssue: string; // e.g., "Payment dispute, customer complaint..."
  additionalNotes?: string; // Optional extra details
  timeframe: string; // e.g., "24 hours"
  customerContactLink?: string; // Link to contact customer
  businessContactLink?: string; // Link to contact business
  adminDashboardLink: string; // Link to admin dashboard
}

export default function CriticalOrderIssueAlertEmail({
  orderId,
  customerName,
  businessName,
  items,
  totalAmount,
  orderDate,
  currentStatus,
  specificIssue,
  additionalNotes,
  timeframe,
  customerContactLink,
  businessContactLink,
  adminDashboardLink,
}: CriticalOrderIssueAlertEmailProps) {
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
            <Text style={greeting}>Dear Admin Team,</Text>
            
            <Text style={heading}>Critical Order Issue Alert ⚠️</Text>

            <Text style={paragraph}>
              We've detected a critical issue with an order on Localito that requires your
              review.
            </Text>

            {/* Order Info Section */}
            <Section style={orderBox}>
              <Text style={orderBoxTitle}>Order Info</Text>
              
              <Text style={orderDetail}>
                <strong>Order ID:</strong> {orderId}
              </Text>

              <Text style={orderDetail}>
                <strong>Customer Name:</strong> {customerName}
              </Text>

              <Text style={orderDetail}>
                <strong>Business Name:</strong> {businessName}
              </Text>

              <Hr style={orderDivider} />

              <Text style={itemsTitle}>Items/Services:</Text>
              
              {items.map((item, index) => (
                <Row key={index} style={itemRow}>
                  <Column style={itemNameCol}>
                    <Text style={itemName}>{item.name}</Text>
                  </Column>
                  <Column style={itemQtyCol}>
                    <Text style={itemQty}>× {item.quantity}</Text>
                  </Column>
                  <Column style={itemPriceCol}>
                    <Text style={itemPrice}>£{item.price.toFixed(2)}</Text>
                  </Column>
                </Row>
              ))}

              <Hr style={orderDivider} />

              <Text style={orderDetail}>
                <strong>Total Amount:</strong> £{totalAmount.toFixed(2)} GBP
              </Text>

              <Text style={orderDetail}>
                <strong>Order Date:</strong> {orderDate}
              </Text>

              <Text style={orderDetail}>
                <strong>Status:</strong> {currentStatus}
              </Text>
            </Section>

            {/* Issue Details Section */}
            <Section style={issueBox}>
              <Text style={issueTitle}>Issue Details</Text>
              <Text style={issueText}>{specificIssue}</Text>
              {additionalNotes && (
                <>
                  <Text style={notesLabel}>Additional notes:</Text>
                  <Text style={notesText}>{additionalNotes}</Text>
                </>
              )}
            </Section>

            {/* Action Required Section */}
            <Section style={actionBox}>
              <Text style={actionTitle}>Action Required</Text>
              <Text style={actionText}>
                Please investigate and resolve within <strong>{timeframe}</strong>.
              </Text>
              
              <Text style={optionsTitle}>Options:</Text>
              
              {customerContactLink && (
                <Text style={optionItem}>
                  • <Link href={customerContactLink} style={linkStyle}>Contact Customer</Link>
                </Text>
              )}
              
              {businessContactLink && (
                <Text style={optionItem}>
                  • <Link href={businessContactLink} style={linkStyle}>Contact Business</Link>
                </Text>
              )}
              
              <Text style={optionItem}>
                • <Link href={adminDashboardLink} style={linkStyle}>Refund/Adjust Order</Link> (Admin Dashboard)
              </Text>
              
              <Text style={optionItem}>
                • Escalate if needed by replying to this email
              </Text>
            </Section>

            {/* Admin Dashboard Button */}
            <Section style={ctaSection}>
              <Button style={dashboardButton} href={adminDashboardLink}>
                Go to Admin Dashboard
              </Button>
            </Section>

            {/* Reminder */}
            <Section style={reminderBox}>
              <Text style={reminderText}>
                Ensuring quick resolutions keeps our community trusting Localito.
              </Text>
            </Section>
          </Section>

          {/* Footer */}
          <Hr style={divider} />
          <Section style={footer}>
            <Text style={footerText}>
              <strong>Localito System Alert</strong>
            </Text>
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
              <Link href="https://localito.com" style={footerLink}>Visit Localito</Link>
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
  color: '#DC2626',
  margin: '0 0 20px',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0 0 24px',
};

const orderBox = {
  backgroundColor: '#FAFBFC',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '24px',
  margin: '24px 0',
};

const orderBoxTitle = {
  fontSize: '20px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 16px',
};

const orderDetail = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0 0 12px',
};

const orderDivider = {
  borderColor: '#e2e8f0',
  margin: '16px 0',
};

const itemsTitle = {
  fontSize: '16px',
  fontWeight: '600',
  color: '#1a2e4a',
  margin: '0 0 12px',
};

const itemRow = {
  marginBottom: '12px',
};

const itemNameCol = {
  width: '50%',
  paddingRight: '12px',
};

const itemQtyCol = {
  width: '20%',
  textAlign: 'center' as const,
};

const itemPriceCol = {
  width: '30%',
  textAlign: 'right' as const,
};

const itemName = {
  fontSize: '15px',
  color: '#1a2e4a',
  margin: '0',
};

const itemQty = {
  fontSize: '15px',
  color: '#64748b',
  margin: '0',
};

const itemPrice = {
  fontSize: '15px',
  color: '#1a2e4a',
  fontWeight: '600',
  margin: '0',
};

const issueBox = {
  backgroundColor: '#FEE2E2',
  border: '2px solid #DC2626',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const issueTitle = {
  fontSize: '18px',
  fontWeight: '700',
  color: '#1a2e4a',
  margin: '0 0 12px',
};

const issueText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0 0 12px',
};

const notesLabel = {
  fontSize: '15px',
  fontWeight: '600',
  color: '#1a2e4a',
  margin: '12px 0 8px',
};

const notesText = {
  fontSize: '15px',
  lineHeight: '1.6',
  color: '#64748b',
  margin: '0',
  fontStyle: 'italic',
  backgroundColor: '#ffffff',
  padding: '12px',
  borderRadius: '4px',
};

const actionBox = {
  backgroundColor: '#E6F4FE',
  border: '2px solid #094b9e',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const actionTitle = {
  fontSize: '18px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 12px',
};

const actionText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0 0 16px',
};

const optionsTitle = {
  fontSize: '16px',
  fontWeight: '600',
  color: '#1a2e4a',
  margin: '0 0 12px',
};

const optionItem = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0 0 8px',
  paddingLeft: '8px',
};

const ctaSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const dashboardButton = {
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
  fontStyle: 'italic',
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

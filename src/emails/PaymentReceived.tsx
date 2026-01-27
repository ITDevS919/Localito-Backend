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
} from '@react-email/components';
import * as React from 'react';
import { EMAIL_LOGO_URL } from './constants';

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

interface PaymentReceivedEmailProps {
  businessOwnerName: string;
  businessName: string;
  orderId: string;
  customerName: string;
  items: OrderItem[];
  originalTotal: number;
  commissionAmount: number;
  commissionPercentage: number;
  netAmount: number;
  payoutDate: string;
  transactionReference: string;
}

export default function PaymentReceivedEmail({
  businessOwnerName,
  businessName,
  orderId,
  customerName,
  items,
  originalTotal,
  commissionAmount,
  commissionPercentage,
  netAmount,
  payoutDate,
  transactionReference,
}: PaymentReceivedEmailProps) {
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
            
            <Text style={heading}>Payment Received – Payout Confirmed! 💰</Text>

            <Text style={paragraph}>
              We're pleased to confirm that your payout for Order <strong>{orderId}</strong> has been
              processed instantly following collection confirmation.
            </Text>

            {/* Payout Confirmation Section */}
            <Section style={payoutBox}>
              <Text style={payoutBoxTitle}>Payout Confirmation</Text>
              
              <Section style={amountBox}>
                <Text style={amountLabel}>Amount Received</Text>
                <Text style={amountValue}>£{netAmount.toFixed(2)}</Text>
                <Text style={amountNote}>
                  (deposited to your connected Stripe account)
                </Text>
              </Section>

              <Hr style={sectionDivider} />

              <Text style={sectionTitle}>Transaction Details</Text>

              <Text style={detailText}>
                <strong>Order ID:</strong> {orderId}
              </Text>

              <Text style={detailText}>
                <strong>Customer Name:</strong> {customerName}
              </Text>

              <Hr style={itemDivider} />

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

              <Hr style={itemDivider} />

              <Row style={summaryRow}>
                <Column>
                  <Text style={summaryLabel}>Original Total:</Text>
                </Column>
                <Column style={summaryValueCol}>
                  <Text style={summaryValue}>£{originalTotal.toFixed(2)}</Text>
                </Column>
              </Row>

              <Row style={summaryRow}>
                <Column>
                  <Text style={commissionLabel}>
                    Commission Deducted ({commissionPercentage}%):
                  </Text>
                </Column>
                <Column style={summaryValueCol}>
                  <Text style={commissionValue}>-£{commissionAmount.toFixed(2)}</Text>
                </Column>
              </Row>

              <Hr style={itemDivider} />

              <Row style={netRow}>
                <Column>
                  <Text style={netLabel}>Net Amount:</Text>
                </Column>
                <Column style={netValueCol}>
                  <Text style={netValue}>£{netAmount.toFixed(2)}</Text>
                </Column>
              </Row>

              <Hr style={sectionDivider} />

              <Text style={detailText}>
                <strong>Payout Date:</strong> {payoutDate}
              </Text>

              <Text style={detailText}>
                <strong>Reference:</strong> {transactionReference}
              </Text>
            </Section>

            {/* Bank Transfer Notice */}
            <Section style={noticeBox}>
              <Text style={noticeText}>
                Your funds should appear in your bank account within <strong>1–2 business days</strong>
                (depending on your Stripe settings).
              </Text>
            </Section>

            <Text style={closingText}>
              Thanks for being part of Localito – every order keeps Manchester's
              independents thriving! 💙
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

const payoutBox = {
  backgroundColor: '#FAFBFC',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '24px',
  margin: '24px 0',
};

const payoutBoxTitle = {
  fontSize: '20px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 20px',
};

const amountBox = {
  backgroundColor: '#E6F4FE',
  border: '2px solid #094b9e',
  borderRadius: '8px',
  padding: '24px',
  margin: '0 0 24px',
  textAlign: 'center' as const,
};

const amountLabel = {
  fontSize: '16px',
  fontWeight: '600',
  color: '#094b9e',
  margin: '0 0 8px',
};

const amountValue = {
  fontSize: '36px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 8px',
};

const amountNote = {
  fontSize: '14px',
  color: '#64748b',
  margin: '0',
  fontStyle: 'italic',
};

const sectionDivider = {
  borderColor: '#e2e8f0',
  margin: '20px 0',
};

const sectionTitle = {
  fontSize: '18px',
  fontWeight: '700',
  color: '#1a2e4a',
  margin: '0 0 16px',
};

const detailText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0 0 12px',
};

const itemDivider = {
  borderColor: '#e2e8f0',
  margin: '12px 0',
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

const summaryRow = {
  marginBottom: '12px',
};

const summaryValueCol = {
  textAlign: 'right' as const,
};

const summaryLabel = {
  fontSize: '16px',
  color: '#1a2e4a',
  margin: '0',
};

const summaryValue = {
  fontSize: '16px',
  fontWeight: '600',
  color: '#1a2e4a',
  margin: '0',
};

const commissionLabel = {
  fontSize: '16px',
  color: '#64748b',
  margin: '0',
};

const commissionValue = {
  fontSize: '16px',
  fontWeight: '600',
  color: '#64748b',
  margin: '0',
};

const netRow = {
  marginTop: '16px',
  paddingTop: '16px',
  borderTop: '2px solid #094b9e',
};

const netValueCol = {
  textAlign: 'right' as const,
};

const netLabel = {
  fontSize: '18px',
  fontWeight: '600',
  color: '#1a2e4a',
  margin: '0',
};

const netValue = {
  fontSize: '20px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0',
};

const noticeBox = {
  backgroundColor: '#FFF4E6',
  border: '2px solid #FFA500',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const noticeText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0',
  textAlign: 'center' as const,
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

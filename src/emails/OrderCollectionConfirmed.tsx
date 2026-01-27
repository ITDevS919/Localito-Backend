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

interface OrderCollectionConfirmedEmailProps {
  customerName: string;
  orderId: string;
  items: OrderItem[];
  totalAmount: number;
  cashbackAmount: number;
  newCashbackBalance: number;
  businessName: string;
}

export default function OrderCollectionConfirmedEmail({
  customerName,
  orderId,
  items,
  totalAmount,
  cashbackAmount,
  newCashbackBalance,
  businessName,
}: OrderCollectionConfirmedEmailProps) {
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
            
            <Text style={heading}>Your Order Collection Confirmed! ✅</Text>

            <Text style={paragraph}>
              Great news! Your order from <strong>{businessName}</strong> has been successfully collected
              and confirmed via QR scan.
            </Text>

            {/* Receipt Summary Section */}
            <Section style={receiptBox}>
              <Text style={receiptBoxTitle}>Receipt Summary</Text>
              
              <Text style={orderIdText}>
                <strong>Order ID:</strong> {orderId}
              </Text>

              <Hr style={receiptDivider} />

              <Text style={itemsTitle}>Items:</Text>
              
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

              <Hr style={receiptDivider} />

              <Row style={totalRow}>
                <Column>
                  <Text style={totalLabel}>Total Paid:</Text>
                </Column>
                <Column style={totalValueCol}>
                  <Text style={totalAmountText}>£{totalAmount.toFixed(2)}</Text>
                </Column>
              </Row>

              <Section style={cashbackBox}>
                <Text style={cashbackLabel}>💰 Cashback Credited:</Text>
                <Text style={cashbackAmountText}>£{cashbackAmount.toFixed(2)}</Text>
                <Text style={cashbackNote}>
                  (1% instant reward!)
                </Text>
              </Section>

              <Section style={balanceBox}>
                <Text style={balanceLabel}>New Cashback Balance:</Text>
                <Text style={balanceAmountText}>£{newCashbackBalance.toFixed(2)}</Text>
                <Text style={balanceNote}>
                  (Redeem on your next order)
                </Text>
              </Section>
            </Section>

            <Text style={thankYouText}>
              Thank you for supporting Manchester's independents – your purchase keeps
              our communities thriving! 💙
            </Text>

            {/* Review CTA */}
            <Section style={ctaSection}>
              <Text style={ctaText}>
                If everything looks good, we'd love a quick review in the app.
              </Text>
              <Button style={ctaButton} href="https://localito.com/reviews">
                Leave a Review
              </Button>
            </Section>

            <Text style={closingText}>
              Happy shopping,
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

const receiptBox = {
  backgroundColor: '#FAFBFC',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '24px',
  margin: '24px 0',
};

const receiptBoxTitle = {
  fontSize: '20px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 16px',
};

const orderIdText = {
  fontSize: '16px',
  color: '#1a2e4a',
  margin: '0 0 16px',
};

const receiptDivider = {
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

const totalRow = {
  marginTop: '16px',
};

const totalValueCol = {
  textAlign: 'right' as const,
};

const totalLabel = {
  fontSize: '18px',
  fontWeight: '600',
  color: '#1a2e4a',
  margin: '0',
};

const totalAmountText = {
  fontSize: '20px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0',
};

const cashbackBox = {
  backgroundColor: '#E6F4FE',
  border: '2px solid #094b9e',
  borderRadius: '8px',
  padding: '16px',
  marginTop: '20px',
  textAlign: 'center' as const,
};

const cashbackLabel = {
  fontSize: '16px',
  fontWeight: '600',
  color: '#094b9e',
  margin: '0 0 8px',
};

const cashbackAmountText = {
  fontSize: '24px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 8px',
};

const cashbackNote = {
  fontSize: '14px',
  color: '#64748b',
  margin: '0',
};

const balanceBox = {
  backgroundColor: '#FFF4E6',
  border: '2px solid #FFA500',
  borderRadius: '8px',
  padding: '16px',
  marginTop: '16px',
  textAlign: 'center' as const,
};

const balanceLabel = {
  fontSize: '16px',
  fontWeight: '600',
  color: '#1a2e4a',
  margin: '0 0 8px',
};

const balanceAmountText = {
  fontSize: '22px',
  fontWeight: '700',
  color: '#FFA500',
  margin: '0 0 8px',
};

const balanceNote = {
  fontSize: '14px',
  color: '#64748b',
  margin: '0',
};

const thankYouText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#094b9e',
  fontWeight: '600',
  margin: '32px 0 24px',
  textAlign: 'center' as const,
};

const ctaSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
  padding: '24px',
  backgroundColor: '#FAFBFC',
  borderRadius: '8px',
};

const ctaText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0 0 16px',
};

const ctaButton = {
  backgroundColor: '#FFA500',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 32px',
  minWidth: '180px',
};

const closingText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '24px 0 0',
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

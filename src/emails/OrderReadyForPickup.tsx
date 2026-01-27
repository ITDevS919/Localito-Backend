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

interface OrderReadyForPickupEmailProps {
  customerName: string;
  orderId: string;
  items: OrderItem[];
  totalAmount: number;
  cashbackAmount: number;
  businessName: string;
  businessAddress: string;
  openingHours: string;
  googleMapsLink?: string;
  qrCodeUrl?: string;
}

export default function OrderReadyForPickupEmail({
  customerName,
  orderId,
  items,
  totalAmount,
  cashbackAmount,
  businessName,
  businessAddress,
  openingHours,
  googleMapsLink,
  qrCodeUrl,
}: OrderReadyForPickupEmailProps) {
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
            
            <Text style={heading}>Great news! Your order is ready for collection! 🎉</Text>

            <Text style={paragraph}>
              Your order from <strong>{businessName}</strong> is now ready for pickup.
            </Text>

            {/* Order Details Section */}
            <Section style={orderBox}>
              <Text style={orderBoxTitle}>Order Details</Text>
              
              <Text style={orderIdText}>
                <strong>Order ID:</strong> {orderId}
              </Text>

              <Hr style={orderDivider} />

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

              <Hr style={orderDivider} />

              <Row style={totalRow}>
                <Column>
                  <Text style={totalLabel}>Total Amount:</Text>
                </Column>
                <Column style={totalValueCol}>
                  <Text style={totalAmountText}>£{totalAmount.toFixed(2)}</Text>
                </Column>
              </Row>

              <Section style={cashbackBox}>
                <Text style={cashbackLabel}>💰 Cashback Earned:</Text>
                <Text style={cashbackAmountText}>£{cashbackAmount.toFixed(2)}</Text>
                <Text style={cashbackNote}>
                  (Redeem on your next order!)
                </Text>
              </Section>
            </Section>

            {/* Collection Reminder */}
            <Section style={collectionBox}>
              <Text style={collectionTitle}>Collection Reminder</Text>
              
              <Text style={collectionText}>
                Head to <strong>{businessName}</strong> at {businessAddress} during {openingHours}.
              </Text>

              {googleMapsLink && (
                <Link href={googleMapsLink} style={mapLink}>
                  📍 View on Google Maps
                </Link>
              )}

              {qrCodeUrl && (
                <Section style={qrCodeSection}>
                  <Text style={qrCodeLabel}>
                    Simply show your QR code below for quick verification:
                  </Text>
                  <Img
                    src={qrCodeUrl}
                    alt="Order QR Code"
                    width="200"
                    height="200"
                    style={qrCodeImage}
                  />
                </Section>
              )}

              <Text style={rescheduleNote}>
                If you can't make your confirmed time, please contact the business to reschedule.
              </Text>
            </Section>

            <Text style={thankYouText}>
              Thanks for supporting your local business! 💙
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

const orderIdText = {
  fontSize: '16px',
  color: '#1a2e4a',
  margin: '0 0 16px',
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

const collectionBox = {
  backgroundColor: '#ffffff',
  border: '2px solid #FFA500',
  borderRadius: '8px',
  padding: '24px',
  margin: '24px 0',
};

const collectionTitle = {
  fontSize: '20px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 16px',
};

const collectionText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0 0 12px',
};

const mapLink = {
  fontSize: '15px',
  color: '#094b9e',
  textDecoration: 'underline',
  margin: '0 0 16px',
  display: 'inline-block',
};

const qrCodeSection = {
  textAlign: 'center' as const,
  margin: '24px 0',
  padding: '20px',
  backgroundColor: '#FAFBFC',
  borderRadius: '8px',
};

const qrCodeLabel = {
  fontSize: '15px',
  color: '#1a2e4a',
  margin: '0 0 16px',
};

const qrCodeImage = {
  margin: '0 auto',
  display: 'block',
  border: '2px solid #e2e8f0',
  borderRadius: '8px',
};

const rescheduleNote = {
  fontSize: '14px',
  color: '#64748b',
  fontStyle: 'italic',
  margin: '16px 0 0',
};

const thankYouText = {
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

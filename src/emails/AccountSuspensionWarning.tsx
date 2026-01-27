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

interface AccountSuspensionWarningEmailProps {
  userName: string;
  businessName?: string; // Optional for business accounts
  status: 'suspended' | 'warning';
  reasons: string[]; // Array of specific reasons
  specificAction: string; // e.g., "Update your listings to comply"
  timeframe: string; // e.g., "7 days"
  termsLink: string; // Link to Terms/Guidelines
  appealDeadline?: number; // Days to appeal (default 7)
}

export default function AccountSuspensionWarningEmail({
  userName,
  businessName,
  status,
  reasons,
  specificAction,
  timeframe,
  termsLink,
  appealDeadline = 7,
}: AccountSuspensionWarningEmailProps) {
  const isSuspended = status === 'suspended';
  const displayName = businessName ? `${userName} / ${businessName}` : userName;

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
            <Text style={greeting}>Dear {displayName},</Text>
            
            <Text style={heading}>Important: Account {isSuspended ? 'Suspension' : 'Warning'} Notice</Text>

            <Text style={paragraph}>
              We're reaching out because we've detected an issue with your Localito account
              that requires attention.
            </Text>

            {/* Status Box */}
            <Section style={isSuspended ? suspendedBox : warningBox}>
              <Text style={statusTitle}>
                Account Status: <strong>{isSuspended ? 'Suspended' : 'Warning Issued'}</strong>
              </Text>
            </Section>

            {/* Reasons Section */}
            <Section style={reasonsBox}>
              <Text style={reasonsTitle}>Reason(s) for Action:</Text>
              {reasons.map((reason, index) => (
                <Text key={index} style={reasonItem}>
                  • {reason}
                </Text>
              ))}
            </Section>

            <Text style={seriousnessText}>
              We take these matters seriously to maintain a safe, trustworthy platform for
              all businesses and shoppers.
            </Text>

            {/* Actions Required */}
            <Section style={actionsBox}>
              <Text style={actionsTitle}>Actions Required:</Text>
              <Text style={actionsSubtitle}>To resolve this:</Text>
              
              <Text style={actionItem}>
                1. Review our Terms of Service and Community Guidelines{' '}
                <Link href={termsLink} style={linkStyle}>
                  here
                </Link>
              </Text>
              
              <Text style={actionItem}>
                2. {specificAction} within <strong>{timeframe}</strong>
              </Text>
              
              <Text style={actionItem}>
                3. Reply to this email with any additional information or corrections
              </Text>
            </Section>

            {/* Warning Box */}
            {isSuspended && (
              <Section style={warningNoticeBox}>
                <Text style={warningNoticeText}>
                  <strong>Important:</strong> Failure to act may result in permanent suspension.
                </Text>
              </Section>
            )}

            {/* Appeal Process */}
            <Section style={appealBox}>
              <Text style={appealTitle}>Appeal Process</Text>
              <Text style={appealText}>
                If you believe this is an error, you can appeal by replying to this email within{' '}
                <strong>{appealDeadline} days</strong>. Provide details and any supporting evidence.
                Our team will review within <strong>5 business days</strong> and respond with a final decision.
              </Text>
            </Section>

            {/* Support Message */}
            <Section style={supportBox}>
              <Text style={supportText}>
                We're committed to supporting our community – if this is a misunderstanding,
                let's get it sorted quickly.
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

const suspendedBox = {
  backgroundColor: '#FEE2E2',
  border: '2px solid #DC2626',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
  textAlign: 'center' as const,
};

const warningBox = {
  backgroundColor: '#FFF4E6',
  border: '2px solid #FFA500',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
  textAlign: 'center' as const,
};

const statusTitle = {
  fontSize: '20px',
  fontWeight: '700',
  color: '#1a2e4a',
  margin: '0',
};

const reasonsBox = {
  backgroundColor: '#FAFBFC',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const reasonsTitle = {
  fontSize: '18px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 12px',
};

const reasonItem = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0 0 8px',
  paddingLeft: '8px',
};

const seriousnessText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '24px 0',
  fontStyle: 'italic',
};

const actionsBox = {
  backgroundColor: '#E6F4FE',
  border: '2px solid #094b9e',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const actionsTitle = {
  fontSize: '18px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 8px',
};

const actionsSubtitle = {
  fontSize: '16px',
  fontWeight: '600',
  color: '#1a2e4a',
  margin: '0 0 12px',
};

const actionItem = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0 0 12px',
  paddingLeft: '8px',
};

const warningNoticeBox = {
  backgroundColor: '#FEE2E2',
  border: '2px solid #DC2626',
  borderRadius: '8px',
  padding: '16px',
  margin: '24px 0',
  textAlign: 'center' as const,
};

const warningNoticeText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0',
  fontWeight: '600',
};

const appealBox = {
  backgroundColor: '#FAFBFC',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const appealTitle = {
  fontSize: '18px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 12px',
};

const appealText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0',
};

const supportBox = {
  backgroundColor: '#FAFBFC',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '16px',
  margin: '24px 0',
  textAlign: 'center' as const,
};

const supportText = {
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

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

interface KYCVerificationStatusEmailProps {
  userName: string;
  status: 'approved' | 'rejected';
  rejectionReason?: string; // Required if status is 'rejected'
  appDashboardLink?: string; // Link to app/dashboard
  resubmissionLink?: string; // Link to resubmit documents (required if rejected)
}

export default function KYCVerificationStatusEmail({
  userName,
  status,
  rejectionReason,
  appDashboardLink,
  resubmissionLink,
}: KYCVerificationStatusEmailProps) {
  const isApproved = status === 'approved';

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
            
            <Text style={heading}>Your KYC Verification Status</Text>

            <Text style={paragraph}>
              We're writing to update you on your KYC (Know Your Customer) verification
              for Localito Marketplace Ltd.
            </Text>

            {/* Status Box */}
            <Section style={isApproved ? approvedBox : rejectedBox}>
              <Text style={statusTitle}>
                Verification Status: <strong>{isApproved ? 'Approved' : 'Rejected'}</strong>
              </Text>
            </Section>

            {/* Approved Content */}
            {isApproved && (
              <>
                <Section style={messageBox}>
                  <Text style={messageTitle}>Congratulations! 🎉</Text>
                  <Text style={messageText}>
                    Your account is now fully verified and ready for use. You can
                    now list products/services, receive payments, and access all features.
                  </Text>
                </Section>

                {appDashboardLink && (
                  <Section style={ctaSection}>
                    <Button style={primaryButton} href={appDashboardLink}>
                      Get Started
                    </Button>
                  </Section>
                )}
              </>
            )}

            {/* Rejected Content */}
            {!isApproved && (
              <>
                <Section style={messageBox}>
                  <Text style={messageTitle}>Verification Not Approved</Text>
                  <Text style={messageText}>
                    Unfortunately, your KYC verification was not approved
                    {rejectionReason ? ` due to ${rejectionReason}` : ''}. This is often a simple fix.
                  </Text>
                </Section>

                <Section style={stepsBox}>
                  <Text style={stepsTitle}>Next Steps:</Text>
                  <Text style={stepItem}>
                    1. Review the requirements in the app (e.g., valid ID, proof of address, business
                    registration if applicable).
                  </Text>
                  {resubmissionLink && (
                    <Text style={stepItem}>
                      2. Resubmit updated documents via the link below within <strong>7 days</strong>.
                    </Text>
                  )}
                  <Text style={stepItem}>
                    3. If you need help, reply to this email or contact support at{' '}
                    <Link href="mailto:hello@localito.com" style={linkStyle}>
                      hello@localito.com
                    </Link>{' '}
                    – we're here to assist.
                  </Text>
                </Section>

                {resubmissionLink && (
                  <Section style={ctaSection}>
                    <Button style={primaryButton} href={resubmissionLink}>
                      Resubmit Documents
                    </Button>
                  </Section>
                )}
              </>
            )}

            {/* Compliance Notice */}
            <Section style={noticeBox}>
              <Text style={noticeText}>
                Verification helps keep Localito safe and compliant for everyone. Thank you
                for your patience!
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

const approvedBox = {
  backgroundColor: '#E6F4FE',
  border: '2px solid #094b9e',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
  textAlign: 'center' as const,
};

const rejectedBox = {
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

const messageBox = {
  backgroundColor: '#FAFBFC',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const messageTitle = {
  fontSize: '20px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 12px',
};

const messageText = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0',
};

const stepsBox = {
  backgroundColor: '#FAFBFC',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const stepsTitle = {
  fontSize: '18px',
  fontWeight: '700',
  color: '#094b9e',
  margin: '0 0 16px',
};

const stepItem = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#1a2e4a',
  margin: '0 0 12px',
  paddingLeft: '8px',
};

const linkStyle = {
  color: '#094b9e',
  textDecoration: 'underline',
};

const noticeBox = {
  backgroundColor: '#FAFBFC',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '16px',
  margin: '24px 0',
  textAlign: 'center' as const,
};

const noticeText = {
  fontSize: '14px',
  lineHeight: '1.6',
  color: '#64748b',
  margin: '0',
  fontStyle: 'italic',
};

const ctaSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const primaryButton = {
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

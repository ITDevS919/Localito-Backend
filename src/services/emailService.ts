import { Resend } from 'resend';
import nodemailer, { Transporter } from 'nodemailer';

// Import all React Email render functions
import { renderOurStoryEmail, renderOurStoryEmailText } from '../emails/sendOurStory';
import { renderOrderConfirmationEmail, renderOrderConfirmationEmailText } from '../emails/sendOrderConfirmation';
import { renderOrderReadyForPickupEmail, renderOrderReadyForPickupEmailText } from '../emails/sendOrderReadyForPickup';
import { renderAbandonedCartEmail, renderAbandonedCartEmailText } from '../emails/sendAbandonedCart';
import { renderCartReminderEmail, renderCartReminderEmailText } from '../emails/sendCartReminder';
import { renderOrderCollectionConfirmedEmail, renderOrderCollectionConfirmedEmailText } from '../emails/sendOrderCollectionConfirmed';
import { renderPasswordResetEmail, renderPasswordResetEmailText } from '../emails/sendPasswordReset';
import { renderWelcomeVerificationEmail, renderWelcomeVerificationEmailText } from '../emails/sendWelcomeVerification';
import { renderOrderCancellationEmail, renderOrderCancellationEmailText } from '../emails/sendOrderCancellation';
import { renderNewOrderAlertEmail, renderNewOrderAlertEmailText } from '../emails/sendNewOrderAlert';
import { renderPendingOrderReminderEmail, renderPendingOrderReminderEmailText } from '../emails/sendPendingOrderReminder';
import { renderPaymentReceivedEmail, renderPaymentReceivedEmailText } from '../emails/sendPaymentReceived';
import { renderKYCVerificationStatusEmail, renderKYCVerificationStatusEmailText } from '../emails/sendKYCVerificationStatus';
import { renderBusinessPasswordResetEmail, renderBusinessPasswordResetEmailText } from '../emails/sendBusinessPasswordReset';
import { renderBusinessWelcomeEmail, renderBusinessWelcomeEmailText } from '../emails/sendBusinessWelcome';
import { renderLowStockAlertEmail, renderLowStockAlertEmailText } from '../emails/sendLowStockAlert';
import { renderPaymentIssueEmail, renderPaymentIssueEmailText } from '../emails/sendPaymentIssue';
import { renderCriticalOrderIssueAlertEmail, renderCriticalOrderIssueAlertEmailText } from '../emails/sendCriticalOrderIssueAlert';
import { renderAccountSuspensionWarningEmail, renderAccountSuspensionWarningEmailText } from '../emails/sendAccountSuspensionWarning';

// Import data types
import type { OrderConfirmationData } from '../emails/sendOrderConfirmation';
import type { OrderReadyForPickupData } from '../emails/sendOrderReadyForPickup';
import type { AbandonedCartData } from '../emails/sendAbandonedCart';
import type { CartReminderData } from '../emails/sendCartReminder';
import type { OrderCollectionConfirmedData } from '../emails/sendOrderCollectionConfirmed';
import type { PasswordResetData } from '../emails/sendPasswordReset';
import type { WelcomeVerificationData } from '../emails/sendWelcomeVerification';
import type { OrderCancellationData } from '../emails/sendOrderCancellation';
import type { NewOrderAlertData } from '../emails/sendNewOrderAlert';
import type { PendingOrderReminderData } from '../emails/sendPendingOrderReminder';
import type { PaymentReceivedData } from '../emails/sendPaymentReceived';
import type { KYCVerificationStatusData } from '../emails/sendKYCVerificationStatus';
import type { BusinessPasswordResetData } from '../emails/sendBusinessPasswordReset';
import type { BusinessWelcomeData } from '../emails/sendBusinessWelcome';
import type { LowStockAlertData } from '../emails/sendLowStockAlert';
import type { PaymentIssueData } from '../emails/sendPaymentIssue';
import type { CriticalOrderIssueAlertData } from '../emails/sendCriticalOrderIssueAlert';
import type { AccountSuspensionWarningData } from '../emails/sendAccountSuspensionWarning';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private resend: Resend | null = null;
  private transporter: Transporter | null = null; // Keep for backward compatibility
  private useResend: boolean = true; // Default to Resend

  constructor() {
    this.initializeResend();
    // Keep nodemailer initialization for backward compatibility
    this.initializeTransporter();
  }

  private initializeResend() {
    const resendApiKey = process.env.RESEND_API_KEY;

    if (!resendApiKey) {
      console.warn('[EmailService] RESEND_API_KEY not configured. Falling back to SMTP.');
      this.useResend = false;
      return;
    }

    try {
      this.resend = new Resend(resendApiKey);
      console.log('[EmailService] ✓ Resend initialized successfully');
    } catch (error) {
      console.error('[EmailService] Failed to initialize Resend:', error);
      this.useResend = false;
    }
  }

  private initializeTransporter() {
    // Only initialize if Resend is not available
    if (this.useResend && this.resend) {
      return;
    }

    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const smtpPort = parseInt(process.env.SMTP_PORT || '587');
    const smtpUser = process.env.SMTP_USER;
    const smtpPassword = process.env.SMTP_PASSWORD;

    if (!smtpUser || !smtpPassword) {
      console.warn('[EmailService] SMTP credentials not configured. Email sending will be disabled.');
      this.transporter = null;
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
      });

      this.transporter.verify((error) => {
        if (error) {
          console.error('[EmailService] SMTP connection verification failed:', error);
        } else {
          console.log('[EmailService] ✓ SMTP server is ready to send emails');
        }
      });
    } catch (error) {
      console.error('[EmailService] Failed to initialize email transporter:', error);
      this.transporter = null;
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    // Prefer Resend if available
    if (this.useResend && this.resend) {
      return this.sendEmailViaResend(options);
    }

    // Fallback to SMTP
    if (this.transporter) {
      return this.sendEmailViaSMTP(options);
    }

    console.warn('[EmailService] No email service configured. Skipping email send.');
    return false;
  }

  private async sendEmailViaResend(options: EmailOptions): Promise<boolean> {
    if (!this.resend) {
      return false;
    }

    try {
      const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.SMTP_FROM_EMAIL || 'hello@localito.com';
      const fromName = process.env.RESEND_FROM_NAME || process.env.SMTP_FROM_NAME || 'Localito';

      const { data, error } = await this.resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.htmlToText(options.html),
      });

      if (error) {
        console.error('[EmailService] Resend error:', error);
        return false;
      }

      console.log(`[EmailService] ✓ Email sent successfully via Resend to ${options.to}`);
      return true;
    } catch (error: any) {
      console.error('[EmailService] Failed to send email via Resend:', error);
      return false;
    }
  }

  private async sendEmailViaSMTP(options: EmailOptions): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'noreply@localito.com';
      const fromName = process.env.SMTP_FROM_NAME || 'Localito';

      await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.htmlToText(options.html),
      });

      console.log(`[EmailService] ✓ Email sent successfully via SMTP to ${options.to}`);
      return true;
    } catch (error: any) {
      console.error('[EmailService] Failed to send email via SMTP:', error);
      return false;
    }
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  // ============================================
  // React Email Template Methods
  // ============================================

  /**
   * Send "Our Story" introductory email
   */
  async sendOurStoryEmail(to: string, recipientName?: string): Promise<boolean> {
    try {
      const html = await renderOurStoryEmail(recipientName);
      const text = renderOurStoryEmailText(recipientName);
      return this.sendEmail({
        to,
        subject: 'Welcome to Localito – Our Story',
        html,
        text,
      });
    } catch (error: any) {
      console.error('[EmailService] Failed to send Our Story email:', error);
      return false;
    }
  }

  /**
   * Send order confirmation email to customer
   */
  async sendOrderConfirmationEmail(to: string, data: OrderConfirmationData): Promise<boolean> {
    try {
      const html = await renderOrderConfirmationEmail(data);
      const text = renderOrderConfirmationEmailText(data);
      return this.sendEmail({
        to,
        subject: `Your Localito Order Confirmation – ${data.orderId}`,
        html,
        text,
      });
    } catch (error: any) {
      console.error('[EmailService] Failed to send order confirmation email:', error);
      return false;
    }
  }

  /**
   * Send "Order Ready for Pickup" notification
   */
  async sendOrderReadyForPickupEmail(to: string, data: OrderReadyForPickupData): Promise<boolean> {
    try {
      const html = await renderOrderReadyForPickupEmail(data);
      const text = renderOrderReadyForPickupEmailText(data);
      return this.sendEmail({
        to,
        subject: `Your Localito Order is Ready for Pickup – ${data.orderId}`,
        html,
        text,
      });
    } catch (error: any) {
      console.error('[EmailService] Failed to send order ready email:', error);
      return false;
    }
  }

  /**
   * Send abandoned cart reminder (first)
   */
  async sendAbandonedCartEmail(to: string, data: AbandonedCartData): Promise<boolean> {
    try {
      const html = await renderAbandonedCartEmail(data);
      const text = renderAbandonedCartEmailText(data);
      return this.sendEmail({
        to,
        subject: "Don't Miss Out – Your Localito Cart is Waiting!",
        html,
        text,
      });
    } catch (error: any) {
      console.error('[EmailService] Failed to send abandoned cart email:', error);
      return false;
    }
  }

  /**
   * Send cart reminder (follow-up)
   */
  async sendCartReminderEmail(to: string, data: CartReminderData): Promise<boolean> {
    try {
      const html = await renderCartReminderEmail(data);
      const text = renderCartReminderEmailText(data);
      return this.sendEmail({
        to,
        subject: 'Quick Reminder – Your Localito Cart Awaits!',
        html,
        text,
      });
    } catch (error: any) {
      console.error('[EmailService] Failed to send cart reminder email:', error);
      return false;
    }
  }

  /**
   * Send order collection confirmed email
   */
  async sendOrderCollectionConfirmedEmail(to: string, data: OrderCollectionConfirmedData): Promise<boolean> {
    try {
      const html = await renderOrderCollectionConfirmedEmail(data);
      const text = renderOrderCollectionConfirmedEmailText(data);
      return this.sendEmail({
        to,
        subject: `Order Collected – ${data.orderId} Confirmed!`,
        html,
        text,
      });
    } catch (error: any) {
      console.error('[EmailService] Failed to send order collection confirmed email:', error);
      return false;
    }
  }

  /**
   * Send password reset email (customer)
   */
  async sendPasswordResetEmail(to: string, data: PasswordResetData): Promise<boolean> {
    try {
      const html = await renderPasswordResetEmail(data);
      const text = renderPasswordResetEmailText(data);
      return this.sendEmail({
        to,
        subject: 'Reset Your Localito Password',
        html,
        text,
      });
    } catch (error: any) {
      console.error('[EmailService] Failed to send password reset email:', error);
      return false;
    }
  }

  /**
   * Send welcome and verification email
   */
  async sendWelcomeVerificationEmail(to: string, data: WelcomeVerificationData): Promise<boolean> {
    try {
      const html = await renderWelcomeVerificationEmail(data);
      const text = renderWelcomeVerificationEmailText(data);
      return this.sendEmail({
        to,
        subject: 'Welcome to Localito – Verify Your Account!',
        html,
        text,
      });
    } catch (error: any) {
      console.error('[EmailService] Failed to send welcome verification email:', error);
      return false;
    }
  }

  /**
   * Send order cancellation/refund confirmation
   */
  async sendOrderCancellationEmail(to: string, data: OrderCancellationData): Promise<boolean> {
    try {
      const html = await renderOrderCancellationEmail(data);
      const text = renderOrderCancellationEmailText(data);
      return this.sendEmail({
        to,
        subject: `Your Localito Order Cancellation/Refund Confirmation – ${data.orderId}`,
        html,
        text,
      });
    } catch (error: any) {
      console.error('[EmailService] Failed to send order cancellation email:', error);
      return false;
    }
  }

  /**
   * Send new order alert to business
   */
  async sendNewOrderAlertEmail(to: string, data: NewOrderAlertData): Promise<boolean> {
    try {
      const html = await renderNewOrderAlertEmail(data);
      const text = renderNewOrderAlertEmailText(data);
      return this.sendEmail({
        to,
        subject: `New Order Alert – ${data.orderId} from ${data.customerName}`,
        html,
        text,
      });
    } catch (error: any) {
      console.error('[EmailService] Failed to send new order alert email:', error);
      return false;
    }
  }

  /**
   * Send pending order reminder to business
   */
  async sendPendingOrderReminderEmail(to: string, data: PendingOrderReminderData): Promise<boolean> {
    try {
      const html = await renderPendingOrderReminderEmail(data);
      const text = renderPendingOrderReminderEmailText(data);
      return this.sendEmail({
        to,
        subject: `Friendly Reminder – Order ${data.orderId} is Pending at ${data.businessName}`,
        html,
        text,
      });
    } catch (error: any) {
      console.error('[EmailService] Failed to send pending order reminder email:', error);
      return false;
    }
  }

  /**
   * Send payment received confirmation to business
   */
  async sendPaymentReceivedEmail(to: string, data: PaymentReceivedData): Promise<boolean> {
    try {
      const html = await renderPaymentReceivedEmail(data);
      const text = renderPaymentReceivedEmailText(data);
      return this.sendEmail({
        to,
        subject: `Payment Received – Order ${data.orderId} Payout Confirmed!`,
        html,
        text,
      });
    } catch (error: any) {
      console.error('[EmailService] Failed to send payment received email:', error);
      return false;
    }
  }

  /**
   * Send KYC verification status email
   */
  async sendKYCVerificationStatusEmail(to: string, data: KYCVerificationStatusData): Promise<boolean> {
    try {
      const html = await renderKYCVerificationStatusEmail(data);
      const text = renderKYCVerificationStatusEmailText(data);
      const statusText = data.status === 'approved' ? 'Approved' : 'Rejected';
      return this.sendEmail({
        to,
        subject: `Your Localito KYC Verification Status – ${statusText}`,
        html,
        text,
      });
    } catch (error: any) {
      console.error('[EmailService] Failed to send KYC verification status email:', error);
      return false;
    }
  }

  /**
   * Send business password reset email
   */
  async sendBusinessPasswordResetEmail(to: string, data: BusinessPasswordResetData): Promise<boolean> {
    try {
      const html = await renderBusinessPasswordResetEmail(data);
      const text = renderBusinessPasswordResetEmailText(data);
      return this.sendEmail({
        to,
        subject: 'Reset Your Localito Business Password',
        html,
        text,
      });
    } catch (error: any) {
      console.error('[EmailService] Failed to send business password reset email:', error);
      return false;
    }
  }

  /**
   * Send business welcome email
   */
  async sendBusinessWelcomeEmail(to: string, data: BusinessWelcomeData): Promise<boolean> {
    try {
      const html = await renderBusinessWelcomeEmail(data);
      const text = renderBusinessWelcomeEmailText(data);
      return this.sendEmail({
        to,
        subject: "Welcome to Localito – Let's Get Your Business Live!",
        html,
        text,
      });
    } catch (error: any) {
      console.error('[EmailService] Failed to send business welcome email:', error);
      return false;
    }
  }

  /**
   * Send low stock alert to business
   */
  async sendLowStockAlertEmail(to: string, data: LowStockAlertData): Promise<boolean> {
    try {
      const html = await renderLowStockAlertEmail(data);
      const text = renderLowStockAlertEmailText(data);
      return this.sendEmail({
        to,
        subject: `Low Stock Alert – ${data.productName} at ${data.businessName}`,
        html,
        text,
      });
    } catch (error: any) {
      console.error('[EmailService] Failed to send low stock alert email:', error);
      return false;
    }
  }

  /**
   * Send payment issue notification to customer
   */
  async sendPaymentIssueEmail(to: string, data: PaymentIssueData): Promise<boolean> {
    try {
      const html = await renderPaymentIssueEmail(data);
      const text = renderPaymentIssueEmailText(data);
      return this.sendEmail({
        to,
        subject: `Payment Issue with Your Localito Order – ${data.orderId}`,
        html,
        text,
      });
    } catch (error: any) {
      console.error('[EmailService] Failed to send payment issue email:', error);
      return false;
    }
  }

  /**
   * Send critical order issue alert to admin
   */
  async sendCriticalOrderIssueAlertEmail(to: string, data: CriticalOrderIssueAlertData): Promise<boolean> {
    try {
      const html = await renderCriticalOrderIssueAlertEmail(data);
      const text = renderCriticalOrderIssueAlertEmailText(data);
      return this.sendEmail({
        to,
        subject: `Critical Order Issue Alert – ${data.orderId} Needs Immediate Attention`,
        html,
        text,
      });
    } catch (error: any) {
      console.error('[EmailService] Failed to send critical order issue alert email:', error);
      return false;
    }
  }

  /**
   * Send account suspension/warning email
   */
  async sendAccountSuspensionWarningEmail(to: string, data: AccountSuspensionWarningData): Promise<boolean> {
    try {
      const html = await renderAccountSuspensionWarningEmail(data);
      const text = renderAccountSuspensionWarningEmailText(data);
      const statusText = data.status === 'suspended' ? 'Account Suspended' : 'Account Warning';
      return this.sendEmail({
        to,
        subject: `${statusText} – Action Required`,
        html,
        text,
      });
    } catch (error: any) {
      console.error('[EmailService] Failed to send account suspension warning email:', error);
      return false;
    }
  }

  // ============================================
  // Legacy Booking Methods (kept for backward compatibility)
  // ============================================

  /**
   * Customer booking confirmation email (legacy - uses inline HTML)
   * @deprecated Consider migrating to React Email template
   */
  async sendBookingConfirmationToCustomer(
    customerEmail: string,
    customerName: string,
    bookingDetails: {
      orderId: string;
      businessName: string;
      bookingDate: string;
      bookingTime: string;
      duration: number;
      services: Array<{ name: string; quantity: number; price: number }>;
      total: number;
      pickupLocation?: string;
      pickupInstructions?: string;
    }
  ): Promise<boolean> {
    const formattedDate = new Date(bookingDetails.bookingDate).toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmation</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #667eea;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #667eea;
      margin: 0;
      font-size: 28px;
    }
    .success-icon {
      font-size: 48px;
      margin-bottom: 10px;
    }
    .booking-details {
      background-color: #f8f9fa;
      border-radius: 6px;
      padding: 20px;
      margin: 20px 0;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      font-weight: 600;
      color: #666;
    }
    .detail-value {
      color: #333;
    }
    .services-list {
      margin: 15px 0;
    }
    .service-item {
      padding: 8px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .service-item:last-child {
      border-bottom: none;
    }
    .total {
      font-size: 20px;
      font-weight: bold;
      color: #667eea;
      text-align: right;
      margin-top: 15px;
      padding-top: 15px;
      border-top: 2px solid #667eea;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      text-align: center;
      color: #666;
      font-size: 14px;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: #667eea;
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      margin-top: 20px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="success-icon">✓</div>
      <h1>Booking Confirmed!</h1>
    </div>
    
    <p>Hi ${customerName},</p>
    
    <p>Your booking has been confirmed. We're looking forward to seeing you!</p>
    
    <div class="booking-details">
      <h2 style="margin-top: 0; color: #667eea;">Booking Details</h2>
      
      <div class="detail-row">
        <span class="detail-label">Order ID:</span>
        <span class="detail-value">#${bookingDetails.orderId.slice(0, 8)}</span>
      </div>
      
      <div class="detail-row">
        <span class="detail-label">Business:</span>
        <span class="detail-value">${bookingDetails.businessName}</span>
      </div>
      
      <div class="detail-row">
        <span class="detail-label">Date:</span>
        <span class="detail-value">${formattedDate}</span>
      </div>
      
      <div class="detail-row">
        <span class="detail-label">Time:</span>
        <span class="detail-value">${bookingDetails.bookingTime}</span>
      </div>
      
      <div class="detail-row">
        <span class="detail-label">Duration:</span>
        <span class="detail-value">${bookingDetails.duration} minutes</span>
      </div>
      
      ${bookingDetails.pickupLocation ? `
      <div class="detail-row">
        <span class="detail-label">Location:</span>
        <span class="detail-value">${bookingDetails.pickupLocation}</span>
      </div>
      ` : ''}
      
      ${bookingDetails.pickupInstructions ? `
      <div class="detail-row">
        <span class="detail-label">Instructions:</span>
        <span class="detail-value">${bookingDetails.pickupInstructions}</span>
      </div>
      ` : ''}
    </div>
    
    <div class="services-list">
      <h3 style="color: #667eea;">Services Booked:</h3>
      ${bookingDetails.services.map(service => `
        <div class="service-item">
          <strong>${service.name}</strong> × ${service.quantity} - £${(service.price * service.quantity).toFixed(2)}
        </div>
      `).join('')}
    </div>
    
    <div class="total">
      Total: £${bookingDetails.total.toFixed(2)}
    </div>
    
    <div style="text-align: center;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/orders/${bookingDetails.orderId}" class="button">
        View Order Details
      </a>
    </div>
    
    <div class="footer">
      <p>If you need to make any changes to your booking, please contact ${bookingDetails.businessName} directly.</p>
      <p>Thank you for choosing Localito!</p>
    </div>
  </div>
</body>
</html>
    `;

    return this.sendEmail({
      to: customerEmail,
      subject: `Booking Confirmed - ${formattedDate} at ${bookingDetails.bookingTime}`,
      html,
    });
  }

  /**
   * Business booking notification email (legacy - uses inline HTML)
   * @deprecated Consider migrating to React Email template
   */
  async sendBookingNotificationToBusiness(
    businessEmail: string,
    businessName: string,
    bookingDetails: {
      orderId: string;
      customerName: string;
      customerEmail: string;
      bookingDate: string;
      bookingTime: string;
      duration: number;
      services: Array<{ name: string; quantity: number; price: number }>;
      total: number;
      pickupInstructions?: string;
    }
  ): Promise<boolean> {
    const formattedDate = new Date(bookingDetails.bookingDate).toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Booking Notification</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #10b981;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #10b981;
      margin: 0;
      font-size: 28px;
    }
    .notification-icon {
      font-size: 48px;
      margin-bottom: 10px;
    }
    .booking-details {
      background-color: #f0fdf4;
      border-radius: 6px;
      padding: 20px;
      margin: 20px 0;
      border-left: 4px solid #10b981;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      font-weight: 600;
      color: #666;
    }
    .detail-value {
      color: #333;
    }
    .services-list {
      margin: 15px 0;
    }
    .service-item {
      padding: 8px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .service-item:last-child {
      border-bottom: none;
    }
    .total {
      font-size: 20px;
      font-weight: bold;
      color: #10b981;
      text-align: right;
      margin-top: 15px;
      padding-top: 15px;
      border-top: 2px solid #10b981;
    }
    .customer-info {
      background-color: #f8f9fa;
      border-radius: 6px;
      padding: 15px;
      margin: 20px 0;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      text-align: center;
      color: #666;
      font-size: 14px;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: #10b981;
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      margin-top: 20px;
      font-weight: 600;
    }
    .urgent {
      background-color: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px;
      border-radius: 6px;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="notification-icon">📅</div>
      <h1>New Booking Received!</h1>
    </div>
    
    <p>Hi ${businessName},</p>
    
    <p>You have received a new booking. Please see the details below:</p>
    
    <div class="booking-details">
      <h2 style="margin-top: 0; color: #10b981;">Booking Details</h2>
      
      <div class="detail-row">
        <span class="detail-label">Order ID:</span>
        <span class="detail-value">#${bookingDetails.orderId.slice(0, 8)}</span>
      </div>
      
      <div class="detail-row">
        <span class="detail-label">Date:</span>
        <span class="detail-value">${formattedDate}</span>
      </div>
      
      <div class="detail-row">
        <span class="detail-label">Time:</span>
        <span class="detail-value">${bookingDetails.bookingTime}</span>
      </div>
      
      <div class="detail-row">
        <span class="detail-label">Duration:</span>
        <span class="detail-value">${bookingDetails.duration} minutes</span>
      </div>
      
      ${bookingDetails.pickupInstructions ? `
      <div class="detail-row">
        <span class="detail-label">Customer Instructions:</span>
        <span class="detail-value">${bookingDetails.pickupInstructions}</span>
      </div>
      ` : ''}
    </div>
    
    <div class="customer-info">
      <h3 style="margin-top: 0; color: #10b981;">Customer Information</h3>
      <p><strong>Name:</strong> ${bookingDetails.customerName}</p>
      <p><strong>Email:</strong> <a href="mailto:${bookingDetails.customerEmail}">${bookingDetails.customerEmail}</a></p>
    </div>
    
    <div class="services-list">
      <h3 style="color: #10b981;">Services Booked:</h3>
      ${bookingDetails.services.map(service => `
        <div class="service-item">
          <strong>${service.name}</strong> × ${service.quantity} - £${(service.price * service.quantity).toFixed(2)}
        </div>
      `).join('')}
    </div>
    
    <div class="total">
      Total: £${bookingDetails.total.toFixed(2)}
    </div>
    
    <div style="text-align: center;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/business/orders/${bookingDetails.orderId}" class="button">
        View Order Details
      </a>
    </div>
    
    <div class="footer">
      <p>Please make sure you're prepared for this booking. If you need to contact the customer, use the email provided above.</p>
      <p>Thank you for using Localito!</p>
    </div>
  </div>
</body>
</html>
    `;

    return this.sendEmail({
      to: businessEmail,
      subject: `New Booking: ${formattedDate} at ${bookingDetails.bookingTime} - Order #${bookingDetails.orderId.slice(0, 8)}`,
      html,
    });
  }
}

export const emailService = new EmailService();

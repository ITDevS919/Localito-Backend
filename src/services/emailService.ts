import nodemailer, { Transporter } from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private transporter: Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
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
        secure: smtpPort === 465, // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
      });

      // Verify connection
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
    if (!this.transporter) {
      console.warn('[EmailService] Email transporter not initialized. Skipping email send.');
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

      console.log(`[EmailService] ✓ Email sent successfully to ${options.to}`);
      return true;
    } catch (error: any) {
      console.error('[EmailService] Failed to send email:', error);
      return false;
    }
  }

  private htmlToText(html: string): string {
    // Simple HTML to text conversion
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  // Customer booking confirmation email
  async sendBookingConfirmationToCustomer(
    customerEmail: string,
    customerName: string,
    bookingDetails: {
      orderId: string;
      retailerName: string;
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
        <span class="detail-label">Retailer:</span>
        <span class="detail-value">${bookingDetails.retailerName}</span>
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
      <p>If you need to make any changes to your booking, please contact ${bookingDetails.retailerName} directly.</p>
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

  // Retailer booking notification email
  async sendBookingNotificationToRetailer(
    retailerEmail: string,
    retailerName: string,
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
    
    <p>Hi ${retailerName},</p>
    
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
      <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/retailer/orders/${bookingDetails.orderId}" class="button">
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
      to: retailerEmail,
      subject: `New Booking: ${formattedDate} at ${bookingDetails.bookingTime} - Order #${bookingDetails.orderId.slice(0, 8)}`,
      html,
    });
  }
}

export const emailService = new EmailService();


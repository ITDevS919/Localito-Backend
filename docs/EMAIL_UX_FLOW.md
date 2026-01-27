# Email Templates - UX Flow & Integration Guide

**Last Updated:** January 2026  
**Total Templates:** 19 emails covering customer, business, and system workflows

---

## Table of Contents
1. [Customer Journey Emails](#customer-journey-emails)
2. [Business Owner Emails](#business-owner-emails)
3. [System & Admin Emails](#system--admin-emails)
4. [Integration Points](#integration-points)

---

## Customer Journey Emails

### 1. **Welcome Verification Email** (`sendWelcomeVerificationEmail`)
**When:** Immediately after customer signs up  
**Trigger:** User registration endpoint (`POST /api/auth/signup`)  
**Purpose:** Verify email address and welcome new users

**Parameters:**
```typescript
{
  userName: string;           // Customer's name
  verificationLink: string;   // Email verification URL (expires in 24h)
}
```

**UX Flow:**
1. Customer signs up → Account created
2. Email sent immediately with verification link
3. Customer clicks link → Email verified → Account activated
4. If not verified within 24h → Link expires, user must request new verification

**Integration Point:**
```typescript
// In routes/index.ts - signup endpoint
await emailService.sendWelcomeVerificationEmail(
  user.email,
  {
    userName: user.username,
    verificationLink: `${FRONTEND_URL}/verify-email?token=${verificationToken}`
  }
);
```

---

### 2. **Our Story Email** (`sendOurStoryEmail`)
**When:** Manual send or after first order  
**Trigger:** Marketing campaign or post-first-order  
**Purpose:** Brand storytelling and community building

**Parameters:**
```typescript
{
  recipientName?: string;  // Optional, defaults to "Friend"
}
```

**UX Flow:**
- Can be sent manually via admin panel
- Or automatically after customer's first successful order
- Builds brand connection and explains Localito's mission

**Integration Point:**
```typescript
// Manual send or post-first-order
await emailService.sendOurStoryEmail(
  customerEmail,
  { recipientName: customerName }
);
```

---

### 3. **Order Confirmation Email** (`sendOrderConfirmationEmail`)
**When:** Immediately after successful payment  
**Trigger:** Stripe webhook `checkout.session.completed` or order creation  
**Purpose:** Confirm order receipt and provide pickup details

**Parameters:**
```typescript
{
  customerName: string;
  orderId: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  totalAmount: number;
  cashbackAmount: number;      // 1% of total
  businessName: string;
  businessAddress: string;
  googleMapsLink?: string;     // Optional Google Maps URL
  pickupTime: string;          // e.g., "Today between 2:00 PM - 6:00 PM"
  qrCodeUrl?: string;          // Optional QR code for collection verification
}
```

**UX Flow:**
1. Customer completes checkout → Payment processed
2. Order created in database → Status: "pending"
3. Email sent immediately with:
   - Order summary
   - Collection instructions
   - QR code (if enabled)
   - Cashback earned
4. Customer receives confirmation → Can track order status

**Integration Point:**
```typescript
// In routes/index.ts - after order creation
await emailService.sendOrderConfirmationEmail(
  customer.email,
  {
    customerName: customer.username,
    orderId: order.id,
    items: orderItems.map(item => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price
    })),
    totalAmount: order.total,
    cashbackAmount: order.total * 0.01, // 1% cashback
    businessName: business.business_name,
    businessAddress: business.address,
    googleMapsLink: `https://maps.google.com/?q=${encodeURIComponent(business.address)}`,
    pickupTime: order.pickup_time_slot,
    qrCodeUrl: await generateQRCode(order.id) // If QR codes enabled
  }
);
```

---

### 4. **Order Ready for Pickup Email** (`sendOrderReadyForPickupEmail`)
**When:** Business marks order as "ready"  
**Trigger:** Business updates order status via dashboard  
**Purpose:** Notify customer that order is ready for collection

**Parameters:**
```typescript
{
  customerName: string;
  orderId: string;
  businessName: string;
  businessAddress: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  totalAmount: number;
  cashbackAmount: number;
  googleMapsLink?: string;
  openingHours: string;        // e.g., "today until 6:00 PM"
  qrCodeUrl?: string;
}
```

**UX Flow:**
1. Business prepares order → Marks as "ready" in dashboard
2. Order status changes: "pending" → "ready"
3. Email sent to customer automatically
4. Customer receives notification → Can collect order

**Integration Point:**
```typescript
// In routes/index.ts - update order status endpoint
router.put("/orders/:orderId/status", async (req, res) => {
  if (req.body.status === "ready") {
    const order = await getOrder(req.params.orderId);
    await emailService.sendOrderReadyForPickupEmail(
      order.customer_email,
      {
        customerName: order.customer_name,
        orderId: order.id,
        businessName: order.business_name,
        businessAddress: order.business_address,
        items: order.items,
        totalAmount: order.total,
        cashbackAmount: order.cashback,
        googleMapsLink: order.business_maps_link,
        openingHours: order.business_opening_hours,
        qrCodeUrl: order.qr_code_url
      }
    );
  }
});
```

---

### 5. **Order Collection Confirmed Email** (`sendOrderCollectionConfirmedEmail`)
**When:** QR code scanned or business confirms collection  
**Trigger:** Collection verification endpoint  
**Purpose:** Confirm successful collection and trigger payout

**Parameters:**
```typescript
{
  customerName: string;
  orderId: string;
  businessName: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  totalAmount: number;
  cashbackAmount: number;
  newCashbackBalance: number;  // Updated cashback balance after this order
}
```

**UX Flow:**
1. Customer arrives at store → Shows QR code
2. Business scans QR code → Collection verified
3. Order status: "ready" → "collected"
4. Email sent to customer confirming collection
5. **Payout triggered** → Business receives payment (see Payment Received email)

**Integration Point:**
```typescript
// In routes/index.ts - collection verification endpoint
router.post("/orders/:orderId/collect", async (req, res) => {
  // Verify QR code or manual confirmation
  await updateOrderStatus(orderId, "collected");
  
  await emailService.sendOrderCollectionConfirmedEmail(
    order.customer_email,
    {
      customerName: order.customer_name,
      orderId: order.id,
      businessName: order.business_name,
      items: order.items,
      totalAmount: order.total,
      cashbackAmount: order.cashback,
      newCashbackBalance: await getCustomerCashbackBalance(order.customer_id)
    }
  );
  
  // Trigger payout to business
  await processPayout(orderId);
});
```

---

### 6. **Order Cancellation Email** (`sendOrderCancellationEmail`)
**When:** Order cancelled by customer or business  
**Trigger:** Order cancellation endpoint or automatic cancellation  
**Purpose:** Confirm cancellation and refund details

**Parameters:**
```typescript
{
  customerName: string;
  orderId: string;
  businessName: string;
  cancellationReason?: string;  // e.g., "stock issue", "customer request"
  refundAmount: number;
  refundTimeline: string;       // e.g., "3-5 business days"
}
```

**UX Flow:**
1. Customer/business cancels order → Cancellation reason recorded
2. Refund processed (if payment already taken)
3. Email sent with cancellation confirmation
4. Refund appears in customer's account within 3-5 days

**Integration Point:**
```typescript
// In routes/index.ts - cancel order endpoint
router.post("/orders/:orderId/cancel", async (req, res) => {
  const { reason } = req.body;
  await cancelOrder(orderId, reason);
  await processRefund(orderId);
  
  await emailService.sendOrderCancellationEmail(
    order.customer_email,
    {
      customerName: order.customer_name,
      orderId: order.id,
      businessName: order.business_name,
      cancellationReason: reason,
      refundAmount: order.total,
      refundTimeline: "3-5 business days"
    }
  );
});
```

---

### 7. **Abandoned Cart Email** (`sendAbandonedCartEmail`)
**When:** 1 hour after cart abandoned  
**Trigger:** Scheduled job checking cart inactivity  
**Purpose:** Recover abandoned carts

**Parameters:**
```typescript
{
  customerName: string;
  businessName: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  cartTotal: number;
  abandonedCartLink: string;    // Deep link back to cart
}
```

**UX Flow:**
1. Customer adds items to cart → Leaves without checkout
2. Cart marked as "abandoned" after 1 hour of inactivity
3. Scheduled job runs → Email sent
4. Customer clicks link → Returns to cart → Can complete purchase

**Integration Point:**
```typescript
// Scheduled job (cron or queue worker)
async function processAbandonedCarts() {
  const abandonedCarts = await getAbandonedCarts(1); // 1 hour old
  
  for (const cart of abandonedCarts) {
    await emailService.sendAbandonedCartEmail(
      cart.customer_email,
      {
        customerName: cart.customer_name,
        businessName: cart.business_name,
        items: cart.items,
        cartTotal: cart.total,
        abandonedCartLink: `${FRONTEND_URL}/cart?token=${cart.token}`
      }
    );
  }
}
```

---

### 8. **Cart Reminder Email** (`sendCartReminderEmail`)
**When:** 24 hours after abandoned cart email (if still not purchased)  
**Trigger:** Scheduled job checking cart status  
**Purpose:** Second attempt to recover cart

**Parameters:**
```typescript
{
  customerName: string;
  businessName: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  cartTotal: number;
  abandonedCartLink: string;
}
```

**UX Flow:**
1. First abandoned cart email sent → No action
2. 24 hours later → Second reminder sent
3. If still no action → Cart expires after 7 days

**Integration Point:**
```typescript
// Scheduled job - follow-up reminder
async function processCartReminders() {
  const carts = await getAbandonedCarts(25); // 25 hours old (24h after first email)
  
  for (const cart of carts) {
    if (!cart.firstReminderSent) continue; // Only send if first email was sent
    
    await emailService.sendCartReminderEmail(
      cart.customer_email,
      {
        customerName: cart.customer_name,
        businessName: cart.business_name,
        items: cart.items,
        cartTotal: cart.total,
        abandonedCartLink: `${FRONTEND_URL}/cart?token=${cart.token}`
      }
    );
  }
}
```

---

### 9. **Password Reset Email** (`sendPasswordResetEmail`)
**When:** User requests password reset  
**Trigger:** Password reset request endpoint  
**Purpose:** Allow user to reset forgotten password

**Parameters:**
```typescript
{
  userName: string;
  resetLink: string;           // Password reset URL (expires in 1 hour)
}
```

**UX Flow:**
1. User clicks "Forgot Password" → Enters email
2. Reset token generated → Link expires in 1 hour
3. Email sent with reset link
4. User clicks link → Redirected to reset page → Sets new password

**Integration Point:**
```typescript
// In routes/index.ts - password reset request
router.post("/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  const resetToken = generateResetToken();
  await saveResetToken(email, resetToken, 3600); // 1 hour expiry
  
  await emailService.sendPasswordResetEmail(
    email,
    {
      userName: user.username,
      resetLink: `${FRONTEND_URL}/reset-password?token=${resetToken}`
    }
  );
});
```

---

### 10. **Payment Issue Email** (`sendPaymentIssueEmail`)
**When:** Payment fails or requires attention  
**Trigger:** Stripe webhook or payment processing error  
**Purpose:** Alert customer to payment problems

**Parameters:**
```typescript
{
  customerName: string;
  orderId: string;
  issueType: string;           // e.g., "payment_failed", "card_declined"
  issueDescription: string;
  actionRequired: string;      // What customer needs to do
  supportLink: string;
}
```

**UX Flow:**
1. Payment fails during checkout → Error detected
2. Order status: "pending" → "payment_failed"
3. Email sent with issue details and next steps
4. Customer updates payment method → Retry payment

**Integration Point:**
```typescript
// Stripe webhook handler
router.post("/webhooks/stripe", async (req, res) => {
  const event = req.body;
  
  if (event.type === "payment_intent.payment_failed") {
    const order = await getOrderByPaymentIntent(event.data.object.id);
    
    await emailService.sendPaymentIssueEmail(
      order.customer_email,
      {
        customerName: order.customer_name,
        orderId: order.id,
        issueType: "payment_failed",
        issueDescription: event.data.object.last_payment_error?.message,
        actionRequired: "Please update your payment method and try again",
        supportLink: `${FRONTEND_URL}/support`
      }
    );
  }
});
```

---

## Business Owner Emails

### 11. **Business Welcome Email** (`sendBusinessWelcomeEmail`)
**When:** Business account created  
**Trigger:** Business registration endpoint  
**Purpose:** Onboard new business owners

**Parameters:**
```typescript
{
  businessOwnerName: string;
  businessName: string;
  verificationLink: string;    // Email verification (expires in 24h)
  dashboardLink: string;       // Link to business dashboard
}
```

**UX Flow:**
1. Business owner signs up → Account created
2. Email sent with onboarding steps:
   - Verify email
   - Set up profile
   - Connect Stripe
   - List products/services
3. Business completes onboarding → Account activated

**Integration Point:**
```typescript
// In routes/index.ts - business signup
router.post("/auth/signup", async (req, res) => {
  if (req.body.role === "business") {
    const business = await createBusiness(req.body);
    
    await emailService.sendBusinessWelcomeEmail(
      business.email,
      {
        businessOwnerName: business.owner_name,
        businessName: business.business_name,
        verificationLink: `${FRONTEND_URL}/verify-email?token=${verificationToken}`,
        dashboardLink: `${FRONTEND_URL}/business/dashboard`
      }
    );
  }
});
```

---

### 12. **New Order Alert Email** (`sendNewOrderAlertEmail`)
**When:** New order placed  
**Trigger:** Order creation endpoint (same time as customer confirmation)  
**Purpose:** Notify business of new order

**Parameters:**
```typescript
{
  businessOwnerName: string;
  businessName: string;
  orderId: string;
  customerName: string;
  customerContact: string;     // Email or phone
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  totalAmount: number;
  collectionTimeSlot: string;  // e.g., "Today between 2:00 PM - 6:00 PM"
  businessAddress: string;
  manageOrderLink: string;     // Link to order management in dashboard
}
```

**UX Flow:**
1. Customer places order → Payment successful
2. Order created → Status: "pending"
3. **Two emails sent simultaneously:**
   - Customer: Order Confirmation
   - Business: New Order Alert
4. Business receives notification → Prepares order

**Integration Point:**
```typescript
// In routes/index.ts - after order creation
await emailService.sendNewOrderAlertEmail(
  business.email,
  {
    businessOwnerName: business.owner_name,
    businessName: business.business_name,
    orderId: order.id,
    customerName: customer.username,
    customerContact: customer.email,
    items: orderItems,
    totalAmount: order.total,
    collectionTimeSlot: order.pickup_time_slot,
    businessAddress: business.address,
    manageOrderLink: `${FRONTEND_URL}/business/orders/${order.id}`
  }
);
```

---

### 13. **Pending Order Reminder Email** (`sendPendingOrderReminderEmail`)
**When:** Order still pending after 2 hours  
**Trigger:** Scheduled job checking order status  
**Purpose:** Remind business to prepare order

**Parameters:**
```typescript
{
  businessOwnerName: string;
  businessName: string;
  orderId: string;
  customerName: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  totalAmount: number;
  requestedCollectionTime: string;
  manageOrderLink: string;
}
```

**UX Flow:**
1. Order placed → Status: "pending"
2. 2 hours pass → Order still not marked "ready"
3. Reminder email sent to business
4. Business marks order as "ready" → Customer notified

**Integration Point:**
```typescript
// Scheduled job - check pending orders
async function processPendingOrderReminders() {
  const pendingOrders = await getPendingOrdersOlderThan(2); // 2 hours
  
  for (const order of pendingOrders) {
    await emailService.sendPendingOrderReminderEmail(
      order.business_email,
      {
        businessOwnerName: order.business_owner_name,
        businessName: order.business_name,
        orderId: order.id,
        customerName: order.customer_name,
        items: order.items,
        totalAmount: order.total,
        requestedCollectionTime: order.pickup_time_slot,
        manageOrderLink: `${FRONTEND_URL}/business/orders/${order.id}`
      }
    );
  }
}
```

---

### 14. **Payment Received Email** (`sendPaymentReceivedEmail`)
**When:** After collection confirmation  
**Trigger:** Collection verification → Payout processed  
**Purpose:** Confirm payout to business

**Parameters:**
```typescript
{
  businessOwnerName: string;
  businessName: string;
  orderId: string;
  customerName: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  originalTotal: number;
  commissionAmount: number;     // 6-9% commission
  commissionPercentage: number;
  netAmount: number;            // Original total - commission
  payoutDate: string;
  transactionReference: string; // Stripe payout ID
}
```

**UX Flow:**
1. Customer collects order → QR code scanned
2. Collection confirmed → Payout triggered
3. Stripe processes instant payout → Funds sent to business Stripe account
4. Email sent confirming payout details
5. Funds appear in business bank account within 1-2 days

**Integration Point:**
```typescript
// After collection confirmation
async function processPayout(orderId: string) {
  const order = await getOrder(orderId);
  const commission = order.total * 0.06; // 6% commission
  const netAmount = order.total - commission;
  
  const payout = await stripeService.createPayout(
    order.business_stripe_account_id,
    netAmount
  );
  
  await emailService.sendPaymentReceivedEmail(
    order.business_email,
    {
      businessOwnerName: order.business_owner_name,
      businessName: order.business_name,
      orderId: order.id,
      customerName: order.customer_name,
      items: order.items,
      originalTotal: order.total,
      commissionAmount: commission,
      commissionPercentage: 6,
      netAmount: netAmount,
      payoutDate: new Date().toISOString(),
      transactionReference: payout.id
    }
  );
}
```

---

### 15. **Business Password Reset Email** (`sendBusinessPasswordResetEmail`)
**When:** Business owner requests password reset  
**Trigger:** Password reset request endpoint  
**Purpose:** Allow business owner to reset password

**Parameters:**
```typescript
{
  businessOwnerName: string;
  resetLink: string;            // Expires in 1 hour
}
```

**UX Flow:**
1. Business owner clicks "Forgot Password"
2. Reset token generated → Link expires in 1 hour
3. Email sent with reset link
4. Business owner resets password → Can log in

**Integration Point:**
```typescript
// Same as customer password reset, but uses business email template
router.post("/auth/forgot-password", async (req, res) => {
  const user = await getUserByEmail(req.body.email);
  
  if (user.role === "business") {
    await emailService.sendBusinessPasswordResetEmail(
      user.email,
      {
        businessOwnerName: user.business_name,
        resetLink: `${FRONTEND_URL}/reset-password?token=${resetToken}`
      }
    );
  } else {
    await emailService.sendPasswordResetEmail(/* ... */);
  }
});
```

---

### 16. **Low Stock Alert Email** (`sendLowStockAlertEmail`)
**When:** Product stock falls below threshold  
**Trigger:** Stock update or scheduled inventory check  
**Purpose:** Alert business to restock

**Parameters:**
```typescript
{
  businessOwnerName: string;
  businessName: string;
  productName: string;
  currentStockLevel: number;
  thresholdNumber: number;      // Minimum stock level
  updateStockLink: string;      // Link to update stock in dashboard
}
```

**UX Flow:**
1. Product stock updated → Stock level checked
2. If stock < threshold → Alert triggered
3. Email sent to business owner
4. Business updates stock → Alert cleared

**Integration Point:**
```typescript
// After stock update or inventory sync
async function checkStockLevels() {
  const lowStockProducts = await getProductsBelowThreshold();
  
  for (const product of lowStockProducts) {
    await emailService.sendLowStockAlertEmail(
      product.business_email,
      {
        businessOwnerName: product.business_owner_name,
        businessName: product.business_name,
        productName: product.name,
        currentStockLevel: product.stock,
        thresholdNumber: product.stock_threshold,
        updateStockLink: `${FRONTEND_URL}/business/products/${product.id}/edit`
      }
    );
  }
}
```

---

### 17. **KYC Verification Status Email** (`sendKYCVerificationStatusEmail`)
**When:** KYC verification completed (approved/rejected)  
**Trigger:** KYC webhook from Onfido/Sumsub  
**Purpose:** Notify business of verification result

**Parameters:**
```typescript
{
  userName: string;
  status: "approved" | "rejected";
  rejectionReason?: string;     // Required if rejected
  appDashboardLink?: string;    // Optional link to app/dashboard
  resubmissionLink?: string;    // Required if rejected
}
```

**UX Flow:**
1. Business submits KYC documents → Verification in progress
2. KYC provider processes → Webhook received
3. Status: "approved" or "rejected"
4. Email sent with result:
   - **Approved:** Account fully verified, can receive payments
   - **Rejected:** Reason provided, can resubmit within 7 days

**Integration Point:**
```typescript
// KYC webhook handler
router.post("/webhooks/kyc", async (req, res) => {
  const { userId, status, rejectionReason } = req.body;
  const user = await getUser(userId);
  
  await emailService.sendKYCVerificationStatusEmail(
    user.email,
    {
      userName: user.username,
      status: status, // "approved" or "rejected"
      rejectionReason: status === "rejected" ? rejectionReason : undefined,
      resubmissionLink: status === "rejected" 
        ? `${FRONTEND_URL}/business/kyc/resubmit`
        : undefined
    }
  );
});
```

---

## System & Admin Emails

### 18. **Critical Order Issue Alert Email** (`sendCriticalOrderIssueAlertEmail`)
**When:** Critical order problem detected  
**Trigger:** System monitoring or error detection  
**Purpose:** Alert admin/support team to urgent issues

**Parameters:**
```typescript
{
  orderId: string;
  issueType: string;            // e.g., "payment_failed", "collection_failed"
  issueDescription: string;
  customerName: string;
  businessName: string;
  orderDetails: string;         // Full order summary
  actionRequired: string;       // What needs to be done
  adminDashboardLink: string;
}
```

**UX Flow:**
1. System detects critical issue (e.g., payment failed after order created)
2. Alert sent to admin/support team
3. Team investigates → Resolves issue → Customer notified

**Integration Point:**
```typescript
// Error handler or monitoring system
async function handleCriticalOrderIssue(orderId: string, issue: any) {
  const order = await getOrder(orderId);
  
  await emailService.sendCriticalOrderIssueAlertEmail(
    process.env.ADMIN_EMAIL || "support@localito.com",
    {
      orderId: order.id,
      issueType: issue.type,
      issueDescription: issue.description,
      customerName: order.customer_name,
      businessName: order.business_name,
      orderDetails: JSON.stringify(order, null, 2),
      actionRequired: issue.actionRequired,
      adminDashboardLink: `${FRONTEND_URL}/admin/orders/${order.id}`
    }
  );
}
```

---

### 19. **Account Suspension Warning Email** (`sendAccountSuspensionWarningEmail`)
**When:** Account violation detected  
**Trigger:** Admin action or automated violation detection  
**Purpose:** Warn user of account issues before suspension

**Parameters:**
```typescript
{
  userName: string;
  businessName?: string;        // Optional for business accounts
  status: 'suspended' | 'warning';
  reasons: string[];            // Array of specific violation reasons
  specificAction: string;       // What user needs to do (e.g., "Update your listings")
  timeframe: string;            // e.g., "7 days"
  termsLink: string;            // Link to Terms/Guidelines
  appealDeadline?: number;     // Days to appeal (default 7)
}
```

**UX Flow:**
1. Violation detected (e.g., policy breach, payment issues)
2. Warning email sent → User has opportunity to resolve
3. If not resolved → Account suspended
4. User can appeal via support link

**Integration Point:**
```typescript
// Admin action or automated system
async function issueAccountWarning(userId: string, violation: any) {
  const user = await getUser(userId);
  
  await emailService.sendAccountSuspensionWarningEmail(
    user.email,
    {
      userName: user.username,
      violationType: violation.type,
      violationDescription: violation.description,
      actionRequired: violation.actionRequired,
      appealLink: `${FRONTEND_URL}/support/appeal`,
      supportContact: "hello@localito.com"
    }
  );
}
```

---

## Integration Points

> **⚠️ IMPORTANT:** Email integration is **NOT YET IMPLEMENTED** in the codebase. The email templates and service methods exist, but they are not currently called from routes or webhooks. This section documents the **intended** integration points.

### Scheduled Jobs (Cron/Queue Workers)

**Required Scheduled Tasks:**
1. **Abandoned Cart Processing** - Every hour
   - Check carts abandoned > 1 hour
   - Send abandoned cart email

2. **Cart Reminder Follow-up** - Every hour
   - Check carts abandoned > 25 hours
   - Send cart reminder email

3. **Pending Order Reminders** - Every 30 minutes
   - Check orders pending > 2 hours
   - Send reminder to business

4. **Stock Level Monitoring** - Every 6 hours
   - Check all products for low stock
   - Send alerts to businesses

### Webhook Handlers

**Required Webhook Endpoints:**
1. **Stripe Webhooks** (`/api/webhooks/stripe`)
   - `checkout.session.completed` → Order Confirmation
   - `payment_intent.payment_failed` → Payment Issue
   - `payout.paid` → Payment Received (optional confirmation)

2. **KYC Webhooks** (`/api/webhooks/kyc`)
   - Verification completed → KYC Status Email

### Real-time Triggers

**Immediate Email Sends:**
- User registration → Welcome Verification
- Order creation → Order Confirmation + New Order Alert
- Order status change to "ready" → Order Ready for Pickup
- Collection confirmation → Collection Confirmed + Payment Received
- Order cancellation → Cancellation Email
- Password reset request → Password Reset Email
- KYC verification complete → KYC Status Email

---

## Email Service Methods Summary

All methods are available in `emailService`:

```typescript
// Customer emails
await emailService.sendWelcomeVerificationEmail(to, data);
await emailService.sendOurStoryEmail(to, data);
await emailService.sendOrderConfirmationEmail(to, data);
await emailService.sendOrderReadyForPickupEmail(to, data);
await emailService.sendOrderCollectionConfirmedEmail(to, data);
await emailService.sendOrderCancellationEmail(to, data);
await emailService.sendAbandonedCartEmail(to, data);
await emailService.sendCartReminderEmail(to, data);
await emailService.sendPasswordResetEmail(to, data);
await emailService.sendPaymentIssueEmail(to, data);

// Business emails
await emailService.sendBusinessWelcomeEmail(to, data);
await emailService.sendNewOrderAlertEmail(to, data);
await emailService.sendPendingOrderReminderEmail(to, data);
await emailService.sendPaymentReceivedEmail(to, data);
await emailService.sendBusinessPasswordResetEmail(to, data);
await emailService.sendLowStockAlertEmail(to, data);
await emailService.sendKYCVerificationStatusEmail(to, data);

// System emails
await emailService.sendCriticalOrderIssueAlertEmail(to, data);
await emailService.sendAccountSuspensionWarningEmail(to, data);
```

---

## Next Steps for Integration

1. **Set up scheduled jobs** for abandoned carts, reminders, and stock alerts
2. **Configure webhook handlers** for Stripe and KYC providers
3. **Add email triggers** to relevant endpoints (order creation, status updates, etc.)
4. **Test each email flow** in development environment
5. **Monitor email delivery** and set up error handling/retries

---

**Document Version:** 1.0  
**Last Updated:** January 2026

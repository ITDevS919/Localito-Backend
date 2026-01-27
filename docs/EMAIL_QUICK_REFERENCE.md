# Email Templates - Quick Reference

**19 Email Templates** organized by user journey stage

---

## 📧 Customer Journey (10 emails)

| Email | Trigger | When | Key Parameters |
|-------|---------|------|----------------|
| **Welcome Verification** | User signup | Immediately | `userName`, `verificationLink` |
| **Our Story** | Marketing/Post-first-order | Manual or post-order | `recipientName` (optional) |
| **Order Confirmation** | Payment successful | Immediately | `orderId`, `items`, `totalAmount`, `cashbackAmount`, `businessName`, `pickupTime`, `qrCodeUrl` |
| **Order Ready for Pickup** | Business marks "ready" | When status changes | `orderId`, `businessName`, `items`, `openingHours`, `qrCodeUrl` |
| **Collection Confirmed** | QR scanned/Collection verified | After collection | `orderId`, `items`, `cashbackAmount`, `newCashbackBalance` |
| **Order Cancellation** | Order cancelled | Immediately | `orderId`, `cancellationReason`, `refundAmount` |
| **Abandoned Cart** | Cart inactive 1 hour | Scheduled (hourly) | `items`, `cartTotal`, `abandonedCartLink` |
| **Cart Reminder** | Cart still abandoned 24h later | Scheduled (hourly) | `items`, `cartTotal`, `abandonedCartLink` |
| **Password Reset** | User requests reset | Immediately | `userName`, `resetLink` (expires 1h) |
| **Payment Issue** | Payment fails | Stripe webhook | `orderId`, `issueType`, `issueDescription`, `actionRequired` |

---

## 🏪 Business Owner Journey (7 emails)

| Email | Trigger | When | Key Parameters |
|-------|---------|------|----------------|
| **Business Welcome** | Business signup | Immediately | `businessOwnerName`, `businessName`, `verificationLink`, `dashboardLink` |
| **New Order Alert** | New order placed | Same time as customer confirmation | `orderId`, `customerName`, `items`, `totalAmount`, `collectionTimeSlot`, `manageOrderLink` |
| **Pending Order Reminder** | Order pending > 2 hours | Scheduled (every 30min) | `orderId`, `customerName`, `items`, `requestedCollectionTime`, `manageOrderLink` |
| **Payment Received** | Collection confirmed | After payout processed | `orderId`, `netAmount`, `commissionAmount`, `commissionPercentage`, `transactionReference` |
| **Business Password Reset** | Business requests reset | Immediately | `businessOwnerName`, `resetLink` (expires 1h) |
| **Low Stock Alert** | Stock < threshold | Stock update or scheduled | `productName`, `currentStockLevel`, `thresholdNumber`, `updateStockLink` |
| **KYC Verification Status** | KYC completed | KYC webhook | `userName`, `status` ("approved"/"rejected"), `rejectionReason` (if rejected), `appDashboardLink` (optional), `resubmissionLink` (if rejected) |

---

## ⚙️ System & Admin (2 emails)

| Email | Trigger | When | Key Parameters |
|-------|---------|------|----------------|
| **Critical Order Issue Alert** | Critical issue detected | System monitoring | `orderId`, `issueType`, `issueDescription`, `customerName`, `businessName`, `actionRequired`, `adminDashboardLink` |
| **Account Suspension Warning** | Violation detected | Admin action or automated | `userName`, `status` ("suspended"/"warning"), `reasons[]`, `specificAction`, `timeframe`, `termsLink` |

---

## 🔄 Order Lifecycle Email Flow

```
1. Customer places order
   ├─→ Customer: Order Confirmation ✅
   └─→ Business: New Order Alert ✅

2. Business prepares order
   ├─→ Business marks "ready"
   └─→ Customer: Order Ready for Pickup ✅

3. Customer collects order
   ├─→ QR code scanned
   ├─→ Customer: Collection Confirmed ✅
   └─→ Business: Payment Received ✅

4. If order cancelled
   └─→ Customer: Order Cancellation ✅
```

---

## ⏰ Scheduled Jobs Required

| Job | Frequency | Purpose |
|-----|-----------|---------|
| Abandoned Cart Check | Every hour | Find carts abandoned > 1 hour, send email |
| Cart Reminder Follow-up | Every hour | Find carts abandoned > 25 hours, send reminder |
| Pending Order Reminders | Every 30 minutes | Find orders pending > 2 hours, remind business |
| Stock Level Check | Every 6 hours | Check all products, alert low stock |

---

## 🔗 Webhook Handlers Required

| Webhook | Provider | Triggers Email |
|---------|----------|----------------|
| `checkout.session.completed` | Stripe | Order Confirmation |
| `payment_intent.payment_failed` | Stripe | Payment Issue |
| `payout.paid` | Stripe | Payment Received (optional) |
| Verification completed | Onfido/Sumsub | KYC Verification Status |

---

## 📋 Integration Checklist

> **⚠️ Status:** Email templates exist but integration is **NOT YET IMPLEMENTED**

- [ ] Set up scheduled jobs (cron/queue workers)
- [ ] Configure Stripe webhook endpoints
- [ ] Configure KYC webhook endpoints
- [ ] Add email triggers to order creation endpoint
- [ ] Add email triggers to order status update endpoint
- [ ] Add email triggers to collection verification endpoint
- [ ] Add email triggers to password reset endpoint
- [ ] Add email triggers to user registration endpoint
- [ ] Add email triggers to business registration endpoint
- [ ] Test all email flows in development
- [ ] Set up email delivery monitoring
- [ ] Configure error handling and retries

---

**See full details:** `EMAIL_UX_FLOW.md`

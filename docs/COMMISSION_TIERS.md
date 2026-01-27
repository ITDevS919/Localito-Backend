# Commission Tier System

**Last Updated:** January 2026  
**Status:** ✅ **Implemented**

---

## Overview

Localito uses a **tiered commission system** based on business turnover. As businesses grow and process more orders, their commission rate decreases, incentivizing growth and rewarding high-performing businesses.

---

## Commission Tiers

| Tier | Turnover Range (30-day) | Commission Rate | Commission % |
|------|-------------------------|-----------------|--------------|
| **Starter** | £0 - £5,000 | 0.09 | 9% |
| **Growth** | £5,000 - £10,000 | 0.08 | 8% |
| **Momentum** | £10,000 - £25,000 | 0.07 | 7% |
| **Elite** | £25,000+ | 0.06 | 6% |

**Note:** Commission rates decrease as turnover increases, rewarding businesses that drive more sales.

---

## How It Works

### Turnover Calculation
- **Period:** 30-day rolling window (last 30 days from current date)
- **Calculation:** Sum of all order totals for orders with status:
  - `processing`
  - `ready_for_pickup`
  - `completed`
  - `collected`
- **Currency:** GBP (converted from other currencies if needed)

### Commission Priority
When calculating commission for a payment, the system checks in this order:

1. **Trial Period** → 0% commission (if business is in trial)
2. **Business Override** → Custom rate set by admin (if set)
3. **Tier-Based Rate** → Based on 30-day turnover (automatic)
4. **Platform Default** → Fallback rate (10% if not configured)

### Real-Time Calculation
- Turnover is calculated **on-demand** when processing payments
- No need to store turnover separately - it's computed from orders
- Ensures always up-to-date tier assignment

---

## API Endpoints

### Business Endpoints

#### GET `/api/business/commission-tier`
Get current commission tier and turnover information.

**Response:**
```json
{
  "success": true,
  "data": {
    "currentTier": {
      "name": "Starter",
      "commissionRate": 0.09,
      "commissionPercentage": "9.0",
      "minTurnover": 0,
      "maxTurnover": 5000
    },
    "turnover": {
      "current": 3500.00,
      "period": "30-day rolling",
      "currency": "GBP"
    },
    "nextTier": {
      "name": "Growth",
      "commissionRate": 0.08,
      "commissionPercentage": "8.0",
      "minTurnover": 5000,
      "turnoverNeeded": 1500.00
    }
  }
}
```

### Admin Endpoints

#### GET `/api/admin/settings/commission-tiers`
Get all commission tier configurations.

**Response:**
```json
{
  "success": true,
  "data": {
    "tiers": [
      {
        "name": "Starter",
        "minTurnover": 0,
        "maxTurnover": 5000,
        "commissionRate": 0.09,
        "commissionPercentage": "9.0"
      },
      // ... other tiers
    ],
    "turnoverPeriod": "30-day rolling",
    "currency": "GBP"
  }
}
```

#### GET `/api/admin/businesses/:businessId/commission-tier`
Get commission tier information for a specific business.

**Response:**
```json
{
  "success": true,
  "data": {
    "businessId": "uuid",
    "businessName": "Example Business",
    "currentTier": {
      "name": "Growth",
      "commissionRate": 0.08,
      "commissionPercentage": "8.0"
    },
    "turnover": {
      "current": 7500.00,
      "period": "30-day rolling",
      "currency": "GBP"
    }
  }
}
```

---

## Implementation Details

### Code Location
- **Tier Configuration:** `server/src/services/stripeService.ts` (lines 33-60)
- **Turnover Calculation:** `server/src/services/stripeService.ts:calculateBusinessTurnover()`
- **Tier Assignment:** `server/src/services/stripeService.ts:getCommissionTierForBusiness()`
- **Commission Rate:** `server/src/services/stripeService.ts:getCommissionRateForBusiness()`

### Database
- **No new tables required** - turnover calculated from existing `orders` table
- Uses order `total` field and status filtering
- Real-time calculation ensures accuracy

---

## Configuration

### Changing Turnover Period

Currently set to **30-day rolling**. To change to **calendar month**:

1. Update `TURNOVER_PERIOD_DAYS` in `stripeService.ts`
2. Modify `calculateBusinessTurnover()` to use calendar month logic:

```typescript
// For calendar month:
const startOfMonth = new Date();
startOfMonth.setDate(1);
startOfMonth.setHours(0, 0, 0, 0);
```

### Adjusting Tier Thresholds

Edit `COMMISSION_TIERS` array in `stripeService.ts`:

```typescript
export const COMMISSION_TIERS: CommissionTier[] = [
  { name: "Starter", minTurnover: 0, maxTurnover: 5000, commissionRate: 0.09 },
  { name: "Growth", minTurnover: 5000, maxTurnover: 10000, commissionRate: 0.08 },
  { name: "Momentum", minTurnover: 10000, maxTurnover: 25000, commissionRate: 0.07 },
  { name: "Elite", minTurnover: 25000, maxTurnover: null, commissionRate: 0.06 },
];
```

---

## Business Override

Admins can set a custom commission rate for specific businesses:

- **Endpoint:** `PUT /api/businesses/:id` (with `commission_rate_override`)
- **Takes Priority:** Overrides tier-based calculation
- **Use Cases:** 
  - Special partnerships
  - Promotional rates
  - Manual adjustments

---

## Testing

### Test Commission Tiers

1. Create test orders with different totals
2. Check tier assignment via `/api/business/commission-tier`
3. Verify commission rate in payment processing logs
4. Test tier progression as turnover increases

### Example Test Scenarios

**Scenario 1: Starter Tier**
- Turnover: £3,500
- Expected Tier: Starter
- Expected Rate: 9%

**Scenario 2: Growth Tier**
- Turnover: £7,500
- Expected Tier: Growth
- Expected Rate: 8%

**Scenario 3: Elite Tier**
- Turnover: £30,000
- Expected Tier: Elite
- Expected Rate: 6%

---

## Future Enhancements

- [ ] Calendar month option (currently 30-day rolling)
- [ ] Tier upgrade notifications to businesses
- [ ] Historical tier tracking
- [ ] Tier-based feature unlocks
- [ ] Admin dashboard for tier analytics

---

## Notes

- **No Monthly Subscription:** Commission-only model (as per business requirements)
- **Tier Adjustments:** Can be adjusted as business grows and more data is available
- **Fair Calculation:** 30-day rolling ensures businesses don't lose tier status due to slow periods

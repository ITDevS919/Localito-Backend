# Cleanup Jobs Documentation

This document describes the automated cleanup jobs required for the Localito platform to maintain data integrity and system health.

## Overview

The platform requires periodic cleanup tasks to:
- Remove expired booking locks
- Cancel abandoned orders
- Clean up stale sessions
- Maintain optimal database performance

## Automatic Cleanups

### 1. Expired Booking Locks (Automatic)

**Status:** ✅ Automatically handled

**Location:** `server/src/services/availabilityService.ts`

**Trigger:** Automatically called before each `getAvailableSlots()` query

**What it does:**
- Deletes booking locks that have expired (older than 15 minutes)
- Frees up booking slots for other customers
- Runs inline during slot availability checks

**No action required:** This cleanup runs automatically whenever a customer checks available booking slots.

---

## Manual/Scheduled Cleanups

### 2. Abandoned Orders Cleanup

**Status:** ⚠️ Requires scheduled execution

**Endpoint:** `POST /api/orders/cleanup-abandoned`

**Frequency:** Recommended every 15-30 minutes

**Authentication:** Requires API key via `x-api-key` header

**What it does:**
- Cancels orders in `awaiting_payment` status for more than 15 minutes
- Deletes associated order items for cancelled orders
- Prevents database bloat from incomplete checkouts
- Does NOT deduct stock (stock is only deducted after successful payment)

**Setup Instructions:**

#### Option 1: Cron Job (Linux/Mac)
```bash
# Add to crontab (runs every 15 minutes)
*/15 * * * * curl -X POST https://your-api.com/api/orders/cleanup-abandoned \
  -H "x-api-key: YOUR_CLEANUP_API_KEY"
```

#### Option 2: GitHub Actions (Recommended for Render deployment)
Create `.github/workflows/cleanup-jobs.yml`:
```yaml
name: Cleanup Jobs
on:
  schedule:
    - cron: '*/15 * * * *'  # Every 15 minutes
  workflow_dispatch:  # Allow manual trigger

jobs:
  cleanup-abandoned-orders:
    runs-on: ubuntu-latest
    steps:
      - name: Cleanup Abandoned Orders
        run: |
          curl -X POST ${{ secrets.API_URL }}/api/orders/cleanup-abandoned \
            -H "x-api-key: ${{ secrets.CLEANUP_API_KEY }}"
```

#### Option 3: Render Cron Job Service
Create a dedicated cron job service on Render:
- Runtime: Shell
- Schedule: `*/15 * * * *`
- Command: 
  ```bash
  curl -X POST $API_URL/api/orders/cleanup-abandoned \
    -H "x-api-key: $CLEANUP_API_KEY"
  ```

---

## Environment Variables

Add these to your `.env` file:

```bash
# Cleanup API key for securing cleanup endpoints
CLEANUP_API_KEY=your-secure-random-key-here
```

**Generate a secure key:**
```bash
# On Linux/Mac
openssl rand -hex 32

# On Windows (PowerShell)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

---

## Monitoring

### Check Cleanup Status

**Abandoned Orders:**
```bash
curl -X POST https://your-api.com/api/orders/cleanup-abandoned \
  -H "x-api-key: YOUR_CLEANUP_API_KEY"
```

Response:
```json
{
  "success": true,
  "message": "Cleaned up 3 abandoned orders",
  "data": {
    "cancelledCount": 3,
    "orderIds": ["order-id-1", "order-id-2", "order-id-3"]
  }
}
```

### Verify Booking Locks Cleanup

Booking locks are automatically cleaned up, but you can verify by querying:
```sql
SELECT COUNT(*) FROM booking_locks WHERE expires_at < NOW();
```

This should always return 0 or a very small number.

---

## Troubleshooting

### Abandoned Orders Not Being Cleaned Up

**Check:**
1. Is the cron job running? Check cron logs: `grep CRON /var/log/syslog`
2. Is the API key correct? Test manually with curl
3. Are orders being created with correct timestamps? Check database

**Query to see abandoned orders:**
```sql
SELECT id, user_id, status, created_at, 
       NOW() - created_at AS age
FROM orders 
WHERE status = 'awaiting_payment' 
  AND stripe_payment_intent_id IS NULL
  AND created_at < NOW() - INTERVAL '15 minutes'
ORDER BY created_at DESC;
```

### Too Many Booking Locks

If you notice many expired locks in the database:

**Diagnosis:**
```sql
SELECT COUNT(*) as expired_locks
FROM booking_locks 
WHERE expires_at < NOW();
```

**Cause:** This shouldn't happen since cleanup is automatic. If it does:
1. Check if `getAvailableSlots()` is being called regularly
2. Manually trigger cleanup: Call `availabilityService.cleanupExpiredLocks()`
3. Check for database connection issues

---

## Performance Considerations

### Abandoned Orders Cleanup
- **Impact:** Minimal (updates < 100 rows typically)
- **Duration:** < 1 second
- **DB Load:** Low (indexed queries)

### Booking Locks Cleanup
- **Impact:** Negligible (inline, < 10ms)
- **Duration:** < 100ms
- **DB Load:** Very low (indexed query)

---

## Future Improvements

Consider implementing these additional cleanup jobs:

1. **Session Cleanup:** Remove expired user sessions (if using database sessions)
2. **Image Cleanup:** Remove orphaned product images from cloud storage
3. **Log Archival:** Archive old application logs to cold storage
4. **Metrics Cleanup:** Remove old analytics data beyond retention period
5. **Failed Payment Retry:** Automatically retry failed payments after 24 hours

---

## Summary Checklist

- [x] Booking locks cleanup - **Automatic** ✅
- [ ] Abandoned orders cleanup - **Needs scheduling** ⚠️
- [ ] Generate and set `CLEANUP_API_KEY` environment variable
- [ ] Set up cron job or scheduled task for abandoned orders
- [ ] Test cleanup endpoints manually
- [ ] Monitor cleanup job execution
- [ ] Set up alerts for failed cleanup jobs

---

## Support

For questions or issues with cleanup jobs, contact:
- Technical Lead: [Your contact info]
- Platform: File an issue on GitHub

Last updated: 2026-02-05

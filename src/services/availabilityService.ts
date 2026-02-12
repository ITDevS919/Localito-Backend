import { pool } from '../db/connection';

export interface TimeSlot {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  available: boolean;
}

export interface AvailabilitySchedule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

export class AvailabilityService {
  // Get weekly schedule for a business
  async getWeeklySchedule(businessId: string): Promise<AvailabilitySchedule[]> {
    const result = await pool.query(
      `SELECT day_of_week, start_time, end_time, is_available
       FROM business_availability_schedules
       WHERE business_id = $1
       ORDER BY day_of_week`,
      [businessId]
    );
    return result.rows.map(row => ({
      dayOfWeek: row.day_of_week,
      startTime: row.start_time,
      endTime: row.end_time,
      isAvailable: row.is_available,
    }));
  }

  // Get available time slots for a date range
  async getAvailableSlots(
    businessId: string,
    startDate: Date,
    endDate: Date,
    durationMinutes: number = 60,
    slotIntervalMinutes: number = 30
  ): Promise<TimeSlot[]> {
    // Automatically clean up expired locks before calculating available slots
    await this.cleanupExpiredLocks();
    const slots: TimeSlot[] = [];
    const currentDate = new Date(startDate);
    
    // Get weekly schedule
    const schedule = await this.getWeeklySchedule(businessId);
    
    // If no schedule exists, return empty array (business needs to set up availability)
    if (schedule.length === 0) {
      return slots;
    }
    
    // Get business cutoff settings
    const businessResult = await pool.query(
      `SELECT same_day_pickup_allowed, cutoff_time FROM businesses WHERE id = $1`,
      [businessId]
    );
    const business = businessResult.rows[0];
    const sameDayPickupAllowed = business?.same_day_pickup_allowed !== false; // Default to true
    const cutoffTime = business?.cutoff_time; // Format: HH:MM:SS or HH:MM
    
    const scheduleMap = new Map(schedule.map(s => [s.dayOfWeek, s]));
    
    // Get blocked dates/times
    const blocks = await this.getBlocks(businessId, startDate, endDate);
    
    // Get existing bookings
    const bookings = await this.getBookings(businessId, startDate, endDate);
    
    // Get active locks
    const locks = await this.getActiveLocks(businessId, startDate, endDate);
    
    // Get today's date for cutoff comparison
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const now = new Date();
    
    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      const daySchedule = scheduleMap.get(dayOfWeek);
      const dateStr = currentDate.toISOString().split('T')[0];
      const isToday = dateStr === todayStr;
      
      // Check same-day pickup rules
      if (isToday) {
        // If same-day pickup is not allowed, skip today
        if (!sameDayPickupAllowed) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }
        
        // If cutoff time is set and current time is past cutoff, skip today
        if (cutoffTime) {
          // Defensive parsing with validation
          const cutoffParts = cutoffTime.split(':');
          if (cutoffParts.length < 2) {
            console.warn(`[Availability] Invalid cutoff time format: ${cutoffTime}`);
            continue; // Skip this day if invalid
          }
          const cutoffHour = parseInt(cutoffParts[0], 10);
          const cutoffMin = parseInt(cutoffParts[1], 10);
          if (isNaN(cutoffHour) || isNaN(cutoffMin)) {
            console.warn(`[Availability] Invalid cutoff time values: ${cutoffTime}`);
            continue; // Skip this day if invalid
          }
          const cutoffDate = new Date();
          cutoffDate.setHours(cutoffHour, cutoffMin || 0, 0, 0);
          
          if (now >= cutoffDate) {
            // Skip today, move to next day
            currentDate.setDate(currentDate.getDate() + 1);
            continue;
          }
        }
      }
      
      if (daySchedule && daySchedule.isAvailable && daySchedule.startTime && daySchedule.endTime) {
        const slotsForDay = this.generateTimeSlots(
          daySchedule.startTime,
          daySchedule.endTime,
          durationMinutes,
          slotIntervalMinutes
        );
        
        for (const slot of slotsForDay) {
          // For same-day slots, check if we're past cutoff time
          if (isToday && cutoffTime) {
            // Defensive parsing with validation
            const cutoffParts = cutoffTime.split(':');
            if (cutoffParts.length < 2) {
              console.warn(`[Availability] Invalid cutoff time format: ${cutoffTime}`);
              continue;
            }
            const cutoffHour = parseInt(cutoffParts[0], 10);
            const cutoffMin = parseInt(cutoffParts[1], 10);
            if (isNaN(cutoffHour) || isNaN(cutoffMin)) {
              console.warn(`[Availability] Invalid cutoff time values: ${cutoffTime}`);
              continue;
            }
            const cutoffDate = new Date();
            cutoffDate.setHours(cutoffHour, cutoffMin || 0, 0, 0);
            
            // Parse slot time (HH:MM format) with validation
            const slotParts = slot.split(':');
            if (slotParts.length < 2) {
              console.warn(`[Availability] Invalid slot time format: ${slot}`);
              continue;
            }
            const slotHour = parseInt(slotParts[0], 10);
            const slotMin = parseInt(slotParts[1], 10);
            if (isNaN(slotHour) || isNaN(slotMin)) {
              console.warn(`[Availability] Invalid slot time values: ${slot}`);
              continue;
            }
            const slotDate = new Date();
            slotDate.setHours(slotHour, slotMin || 0, 0, 0);
            
            // If current time is past cutoff, skip slots that are today
            if (now >= cutoffDate) {
              continue;
            }
          }
          
          // Check if blocked
          const isBlocked = blocks.some(block => 
            this.isSlotBlocked(block, dateStr, slot)
          );
          
          // Check if already booked
          const isBooked = bookings.some(booking =>
            booking.booking_date === dateStr && booking.booking_time === slot
          );
          
          // Check if locked
          const isLocked = locks.some(lock =>
            lock.booking_date === dateStr && lock.booking_time === slot &&
            new Date(lock.expires_at) > new Date()
          );
          
          slots.push({
            date: dateStr,
            time: slot,
            available: !isBlocked && !isBooked && !isLocked,
          });
        }
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return slots;
  }

  // Lock a slot during checkout (expires in 15 minutes)
  async lockSlot(
    businessId: string,
    date: string,
    time: string,
    userId: string
  ): Promise<boolean> {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);
    
    try {
      // First check if slot is actually available
      const slots = await this.getAvailableSlots(
        businessId,
        new Date(date),
        new Date(date),
        60,
        30
      );
      
      const slot = slots.find(s => s.date === date && s.time === time);
      if (!slot || !slot.available) {
        return false;
      }
      
      // Use a more robust locking mechanism with proper race condition handling
      // Try to insert new lock, or update if expired
      const result = await pool.query(
        `INSERT INTO booking_locks (business_id, booking_date, booking_time, locked_by, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (business_id, booking_date, booking_time) 
         DO UPDATE SET 
           locked_by = EXCLUDED.locked_by,
           expires_at = EXCLUDED.expires_at,
           created_at = CURRENT_TIMESTAMP
         WHERE booking_locks.expires_at < NOW()
         RETURNING id`,
        [businessId, date, time, userId, expiresAt]
      );
      
      // If no rows returned, the lock exists and is not expired (conflict with active lock)
      if (result.rowCount === 0) {
        console.log(`[Availability] Slot already locked for business ${businessId} on ${date} at ${time}`);
        return false;
      }
      
      console.log(`[Availability] Successfully locked slot for business ${businessId} on ${date} at ${time} for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Failed to lock slot:', error);
      return false;
    }
  }

  // Release a lock
  async releaseLock(businessId: string, date: string, time: string): Promise<void> {
    await pool.query(
      `DELETE FROM booking_locks 
       WHERE business_id = $1 AND booking_date = $2 AND booking_time = $3`,
      [businessId, date, time]
    );
  }

  // Check if same-day pickup is allowed for a business (for product orders)
  async isSameDayPickupAllowed(businessId: string): Promise<{ allowed: boolean; reason?: string }> {
    const businessResult = await pool.query(
      `SELECT same_day_pickup_allowed, cutoff_time FROM businesses WHERE id = $1`,
      [businessId]
    );
    
    if (businessResult.rows.length === 0) {
      return { allowed: true }; // Default to allowed if business not found
    }
    
    const business = businessResult.rows[0];
    const sameDayPickupAllowed = business?.same_day_pickup_allowed !== false; // Default to true
    const cutoffTime = business?.cutoff_time; // Format: HH:MM:SS or HH:MM
    
    // If same-day pickup is not allowed at all
    if (!sameDayPickupAllowed) {
      return { 
        allowed: false, 
        reason: "Same-day pickup is not allowed for this business. Please select tomorrow or later." 
      };
    }
    
    // If cutoff time is set, check if we're past it
    if (cutoffTime) {
      const now = new Date();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Defensive parsing with validation
      const cutoffParts = cutoffTime.split(':');
      if (cutoffParts.length < 2) {
        console.warn(`[Availability] Invalid cutoff time format: ${cutoffTime}`);
        return { allowed: false, reason: "Invalid cutoff time configuration" };
      }
      const cutoffHour = parseInt(cutoffParts[0], 10);
      const cutoffMin = parseInt(cutoffParts[1], 10);
      if (isNaN(cutoffHour) || isNaN(cutoffMin)) {
        console.warn(`[Availability] Invalid cutoff time values: ${cutoffTime}`);
        return { allowed: false, reason: "Invalid cutoff time configuration" };
      }
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffHour, cutoffMin || 0, 0, 0);
      
      if (now >= cutoffDate) {
        return { 
          allowed: false, 
          reason: `Same-day pickup is not available after ${cutoffTime.slice(0, 5)}. The earliest available pickup date is tomorrow.` 
        };
      }
    }
    
    return { allowed: true };
  }

  // Clean up expired locks
  async cleanupExpiredLocks(): Promise<void> {
    await pool.query(
      `DELETE FROM booking_locks WHERE expires_at < NOW()`
    );
  }

  private generateTimeSlots(
    startTime: string,
    endTime: string,
    durationMinutes: number,
    intervalMinutes: number
  ): string[] {
    const slots: string[] = [];
    
    // Defensive parsing with validation
    const startParts = startTime.split(':');
    const endParts = endTime.split(':');
    
    if (startParts.length < 2 || endParts.length < 2) {
      console.warn(`[Availability] Invalid time format - start: ${startTime}, end: ${endTime}`);
      return slots; // Return empty array if invalid
    }
    
    const startHour = parseInt(startParts[0], 10);
    const startMin = parseInt(startParts[1], 10);
    const endHour = parseInt(endParts[0], 10);
    const endMin = parseInt(endParts[1], 10);
    
    if (isNaN(startHour) || isNaN(startMin) || isNaN(endHour) || isNaN(endMin)) {
      console.warn(`[Availability] Invalid time values - start: ${startTime}, end: ${endTime}`);
      return slots; // Return empty array if invalid
    }
    
    let current = new Date();
    current.setHours(startHour, startMin, 0, 0);
    
    const end = new Date();
    end.setHours(endHour, endMin, 0, 0);
    
    while (current <= end) {
      const slotEnd = new Date(current);
      slotEnd.setMinutes(slotEnd.getMinutes() + durationMinutes);
      
      if (slotEnd <= end) {
        slots.push(current.toTimeString().slice(0, 5));
      }
      
      current.setMinutes(current.getMinutes() + intervalMinutes);
    }
    
    return slots;
  }

  private async getBlocks(businessId: string, startDate: Date, endDate: Date) {
    const result = await pool.query(
      `SELECT block_date, start_time, end_time, is_all_day
       FROM business_availability_blocks
       WHERE business_id = $1 
       AND block_date BETWEEN $2 AND $3`,
      [businessId, startDate, endDate]
    );
    return result.rows;
  }

  private async getBookings(businessId: string, startDate: Date, endDate: Date) {
    const result = await pool.query(
      `SELECT booking_date, booking_time
       FROM orders
       WHERE business_id = $1
       AND booking_date BETWEEN $2 AND $3
       AND booking_status != 'cancelled'
       AND booking_date IS NOT NULL`,
      [businessId, startDate, endDate]
    );
    return result.rows;
  }

  private async getActiveLocks(businessId: string, startDate: Date, endDate: Date) {
    const result = await pool.query(
      `SELECT booking_date, booking_time, expires_at
       FROM booking_locks
       WHERE business_id = $1
       AND booking_date BETWEEN $2 AND $3
       AND expires_at > NOW()`,
      [businessId, startDate, endDate]
    );
    return result.rows;
  }

  private isSlotBlocked(block: any, date: string, time: string): boolean {
    if (block.block_date !== date) return false;
    if (block.is_all_day) return true;
    
    const blockStart = block.start_time || '00:00';
    const blockEnd = block.end_time || '23:59';
    
    return time >= blockStart && time < blockEnd;
  }
}


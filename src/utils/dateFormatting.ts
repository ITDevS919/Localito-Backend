/**
 * Date formatting utilities for consistent date/time display across the application
 * Used primarily for booking and order emails
 */

/**
 * Formats booking date and time for display in emails
 * Handles Date objects, ISO strings, and date strings (YYYY-MM-DD)
 * 
 * Note: Times are stored in the database as TIME (no timezone).
 * For UK marketplace (Localito), times are assumed to be UK local time (GMT/BST).
 * The time is displayed as-is from the database without timezone conversion.
 * 
 * @param bookingDate - Date object, ISO string, or date string (YYYY-MM-DD)
 * @param bookingTime - Time string (HH:MM:SS or HH:MM) - UK local time
 * @returns Formatted string: "Saturday, February 21, 2026 at 10:00"
 *          Returns empty string if both are null/undefined
 *          Returns just date if time is missing
 *          Returns just time if date is missing
 */
export function formatBookingDateTime(
  bookingDate: Date | string | null | undefined,
  bookingTime: string | null | undefined
): string {
  // Handle null/undefined cases
  if (!bookingDate && !bookingTime) {
    return '';
  }

  let formattedDate = '';
  let formattedTime = '';

  // Format date
  if (bookingDate) {
    try {
      // Convert to Date object if it's a string
      const dateObj = bookingDate instanceof Date 
        ? bookingDate 
        : new Date(bookingDate);

      // Check if date is valid
      if (!isNaN(dateObj.getTime())) {
        formattedDate = dateObj.toLocaleDateString('en-GB', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }
    } catch (error) {
      console.error('[formatBookingDateTime] Error formatting date:', error);
      // If date parsing fails, try to use as-is if it's a string
      if (typeof bookingDate === 'string') {
        formattedDate = bookingDate;
      }
    }
  }

  // Format time (remove seconds if present, keep HH:MM format)
  // Note: Time is stored as UK local time (GMT/BST) - displayed as-is
  if (bookingTime) {
    // Remove seconds if present (e.g., "10:00:00" -> "10:00")
    formattedTime = bookingTime.split(':').slice(0, 2).join(':');
  }

  // Combine date and time
  if (formattedDate && formattedTime) {
    return `${formattedDate} at ${formattedTime}`;
  } else if (formattedDate) {
    return formattedDate;
  } else if (formattedTime) {
    return `at ${formattedTime}`;
  }

  return '';
}

/**
 * Formats a date string for display (date only, no time)
 * 
 * @param date - Date object, ISO string, or date string (YYYY-MM-DD)
 * @returns Formatted string: "Saturday, February 21, 2026"
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) {
    return '';
  }

  try {
    const dateObj = date instanceof Date ? date : new Date(date);
    
    if (isNaN(dateObj.getTime())) {
      return '';
    }

    return dateObj.toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch (error) {
    console.error('[formatDate] Error formatting date:', error);
    return '';
  }
}

/**
 * Formats a time string for display (removes seconds if present)
 * 
 * @param time - Time string (HH:MM:SS or HH:MM)
 * @returns Formatted string: "10:00"
 */
export function formatTime(time: string | null | undefined): string {
  if (!time) {
    return '';
  }

  // Remove seconds if present
  return time.split(':').slice(0, 2).join(':');
}

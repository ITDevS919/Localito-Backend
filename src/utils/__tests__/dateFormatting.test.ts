/**
 * Unit tests for date formatting utilities
 */

import { formatBookingDateTime, formatDate, formatTime } from '../dateFormatting';

describe('formatBookingDateTime', () => {
  it('formats Date object with time string', () => {
    const date = new Date('2026-02-21');
    const time = '10:00:00';
    const result = formatBookingDateTime(date, time);
    expect(result).toContain('February 21, 2026');
    expect(result).toContain('at 10:00');
    expect(result).not.toContain('00:00:00 GMT');
    expect(result).not.toContain('Coordinated Universal Time');
  });

  it('formats ISO string with time string', () => {
    const date = '2026-02-21T00:00:00.000Z';
    const time = '10:00:00';
    const result = formatBookingDateTime(date, time);
    expect(result).toContain('February 21, 2026');
    expect(result).toContain('at 10:00');
    expect(result).not.toContain('00:00:00 GMT');
  });

  it('formats date string (YYYY-MM-DD) with time', () => {
    const date = '2026-02-21';
    const time = '10:00:00';
    const result = formatBookingDateTime(date, time);
    expect(result).toContain('February 21, 2026');
    expect(result).toContain('at 10:00');
  });

  it('removes seconds from time string', () => {
    const date = '2026-02-21';
    const time = '10:00:00';
    const result = formatBookingDateTime(date, time);
    expect(result).toContain('10:00');
    expect(result).not.toContain('10:00:00');
  });

  it('handles time without seconds', () => {
    const date = '2026-02-21';
    const time = '10:00';
    const result = formatBookingDateTime(date, time);
    expect(result).toContain('at 10:00');
  });

  it('handles null date gracefully', () => {
    const time = '10:00:00';
    const result = formatBookingDateTime(null, time);
    expect(result).toBe('at 10:00');
  });

  it('handles null time gracefully', () => {
    const date = '2026-02-21';
    const result = formatBookingDateTime(date, null);
    expect(result).toContain('February 21, 2026');
    expect(result).not.toContain('at');
  });

  it('handles both null gracefully', () => {
    const result = formatBookingDateTime(null, null);
    expect(result).toBe('');
  });

  it('handles undefined date gracefully', () => {
    const time = '10:00:00';
    const result = formatBookingDateTime(undefined, time);
    expect(result).toBe('at 10:00');
  });

  it('handles undefined time gracefully', () => {
    const date = '2026-02-21';
    const result = formatBookingDateTime(date, undefined);
    expect(result).toContain('February 21, 2026');
  });

  it('handles invalid date string gracefully', () => {
    const date = 'invalid-date';
    const time = '10:00:00';
    const result = formatBookingDateTime(date, time);
    // Should either return the original string or empty, but not crash
    expect(typeof result).toBe('string');
  });
});

describe('formatDate', () => {
  it('formats Date object', () => {
    const date = new Date('2026-02-21');
    const result = formatDate(date);
    expect(result).toContain('February 21, 2026');
    expect(result).not.toContain('00:00:00');
  });

  it('formats ISO string', () => {
    const date = '2026-02-21T00:00:00.000Z';
    const result = formatDate(date);
    expect(result).toContain('February 21, 2026');
  });

  it('handles null gracefully', () => {
    const result = formatDate(null);
    expect(result).toBe('');
  });
});

describe('formatTime', () => {
  it('removes seconds from time string', () => {
    const time = '10:00:00';
    const result = formatTime(time);
    expect(result).toBe('10:00');
  });

  it('handles time without seconds', () => {
    const time = '10:00';
    const result = formatTime(time);
    expect(result).toBe('10:00');
  });

  it('handles null gracefully', () => {
    const result = formatTime(null);
    expect(result).toBe('');
  });
});

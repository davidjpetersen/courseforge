import { describe, it, expect } from 'vitest';
import {
  parseCronExpression,
  isMinimumInterval,
  cronToPlainLanguage,
  getNextRunTimes,
} from './workflow-ui-utils';

// ---------------------------------------------------------------------------
// parseCronExpression
// ---------------------------------------------------------------------------
describe('parseCronExpression', () => {
  it('accepts a valid 5-field expression', () => {
    expect(parseCronExpression('*/15 * * * *')).toEqual({ valid: true });
    expect(parseCronExpression('0 9 * * 1')).toEqual({ valid: true });
    expect(parseCronExpression('30 14 1 1 *')).toEqual({ valid: true });
  });

  it('rejects empty or non-string input', () => {
    expect(parseCronExpression('')).toEqual({
      valid: false,
      error: 'Cron expression must be a non-empty string',
    });
    expect(parseCronExpression('   ')).toEqual({
      valid: false,
      error: 'Cron expression must be a non-empty string',
    });
  });

  it('rejects expressions with wrong number of fields', () => {
    expect(parseCronExpression('* * *')).toEqual({
      valid: false,
      error: 'Expected 5 fields, got 3',
    });
    expect(parseCronExpression('* * * * * *')).toEqual({
      valid: false,
      error: 'Expected 5 fields, got 6',
    });
  });

  it('rejects invalid characters', () => {
    const result = parseCronExpression('abc * * * *');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid characters');
  });

  it('rejects out-of-range values', () => {
    expect(parseCronExpression('60 * * * *').valid).toBe(false);
    expect(parseCronExpression('* 24 * * *').valid).toBe(false);
    expect(parseCronExpression('* * 32 * *').valid).toBe(false);
    expect(parseCronExpression('* * * 13 *').valid).toBe(false);
    expect(parseCronExpression('* * * * 8').valid).toBe(false);
  });

  it('accepts ranges, lists, and steps', () => {
    expect(parseCronExpression('1-30 * * * *')).toEqual({ valid: true });
    expect(parseCronExpression('0,15,30,45 * * * *')).toEqual({ valid: true });
    expect(parseCronExpression('*/10 9-17 * * 1-5')).toEqual({ valid: true });
  });

  it('rejects day-of-month 0', () => {
    expect(parseCronExpression('0 0 0 * *').valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isMinimumInterval
// ---------------------------------------------------------------------------
describe('isMinimumInterval', () => {
  it('returns true for intervals >= minMinutes', () => {
    expect(isMinimumInterval('*/15 * * * *', 15)).toBe(true);
    expect(isMinimumInterval('*/30 * * * *', 15)).toBe(true);
    expect(isMinimumInterval('0 * * * *', 15)).toBe(true); // every hour
  });

  it('returns false for intervals < minMinutes', () => {
    expect(isMinimumInterval('*/5 * * * *', 15)).toBe(false);
    expect(isMinimumInterval('* * * * *', 15)).toBe(false); // every minute
    expect(isMinimumInterval('*/10 * * * *', 15)).toBe(false);
  });

  it('returns true when day/month/weekday are restricted', () => {
    expect(isMinimumInterval('*/5 * 1 * *', 15)).toBe(true);
    expect(isMinimumInterval('*/5 * * 6 *', 15)).toBe(true);
    expect(isMinimumInterval('*/5 * * * 1', 15)).toBe(true);
  });

  it('returns false for invalid cron', () => {
    expect(isMinimumInterval('bad', 15)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cronToPlainLanguage
// ---------------------------------------------------------------------------
describe('cronToPlainLanguage', () => {
  it('describes every N minutes', () => {
    expect(cronToPlainLanguage('*/15 * * * *')).toBe('Every 15 minutes');
  });

  it('describes every N hours', () => {
    expect(cronToPlainLanguage('0 */2 * * *')).toBe('Every 2 hours');
  });

  it('describes daily at a specific time', () => {
    expect(cronToPlainLanguage('0 9 * * *')).toBe('Daily at 09:00');
    expect(cronToPlainLanguage('30 14 * * *')).toBe('Daily at 14:30');
  });

  it('describes specific day of week', () => {
    expect(cronToPlainLanguage('0 9 * * 1')).toBe('At 09:00 on Monday');
  });

  it('describes specific day of month', () => {
    expect(cronToPlainLanguage('0 9 15 * *')).toBe('At 09:00 on day 15 of every month');
  });

  it('describes every minute', () => {
    expect(cronToPlainLanguage('* * * * *')).toBe('Every minute');
  });

  it('returns fallback for complex expressions', () => {
    const result = cronToPlainLanguage('1-30/5 9-17 * * 1-5');
    expect(result).toContain('Cron:');
  });

  it('returns error string for invalid cron', () => {
    expect(cronToPlainLanguage('bad')).toBe('Invalid cron expression');
  });
});

// ---------------------------------------------------------------------------
// getNextRunTimes
// ---------------------------------------------------------------------------
describe('getNextRunTimes', () => {
  it('returns the requested number of dates', () => {
    const times = getNextRunTimes('*/15 * * * *', 3);
    expect(times).toHaveLength(3);
    times.forEach((t) => expect(t).toBeInstanceOf(Date));
  });

  it('returns dates in ascending order', () => {
    const times = getNextRunTimes('0 * * * *', 5);
    for (let i = 1; i < times.length; i++) {
      expect(times[i].getTime()).toBeGreaterThan(times[i - 1].getTime());
    }
  });

  it('returns all dates in the future', () => {
    const now = Date.now();
    const times = getNextRunTimes('*/30 * * * *', 3);
    times.forEach((t) => expect(t.getTime()).toBeGreaterThan(now));
  });

  it('returns empty array for invalid cron', () => {
    expect(getNextRunTimes('bad', 3)).toEqual([]);
  });

  it('returns empty array for count <= 0', () => {
    expect(getNextRunTimes('*/15 * * * *', 0)).toEqual([]);
  });

  it('returns dates matching the cron minute field', () => {
    const times = getNextRunTimes('0 * * * *', 3);
    times.forEach((t) => expect(t.getMinutes()).toBe(0));
  });
});

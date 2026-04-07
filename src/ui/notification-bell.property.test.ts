import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatRelativeTime } from './notification-bell.js';

/**
 * Validates: Requirement 7.4
 */

/**
 * Convert a formatRelativeTime result to a comparable value in seconds.
 * "just now" → 0
 * "X min ago" → X * 60
 * "X hr ago" → X * 3600
 * "X days ago" → X * 86400
 */
function toSeconds(formatted: string): number {
  if (formatted === 'just now') {
    return 0;
  }
  const match = formatted.match(/^(\d+)\s+(min|hr|days)/);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case 'min': return value * 60;
    case 'hr': return value * 3600;
    case 'days': return value * 86400;
    default: return 0;
  }
}

describe('Property 5: formatRelativeTime monotonicity', () => {
  it('for timestamps t1 < t2 (both before now), the numeric component of formatRelativeTime(t1) >= formatRelativeTime(t2)', () => {
    const fixedNow = new Date('2025-01-15T12:00:00.000Z');

    fc.assert(
      fc.property(
        // Generate two offsets in seconds from `now`, both positive (in the past)
        // offset1 > offset2 means t1 is older than t2
        fc.nat({ max: 365 * 24 * 3600 }).chain((offset1) =>
          fc.nat({ max: offset1 }).map((offset2) => [offset1, offset2] as const),
        ),
        ([offset1, offset2]) => {
          // offset1 >= offset2, so t1 <= t2 (t1 is older or same)
          const t1 = new Date(fixedNow.getTime() - offset1 * 1000).toISOString();
          const t2 = new Date(fixedNow.getTime() - offset2 * 1000).toISOString();

          const result1 = formatRelativeTime(t1, fixedNow);
          const result2 = formatRelativeTime(t2, fixedNow);

          const seconds1 = toSeconds(result1);
          const seconds2 = toSeconds(result2);

          // t1 is older (or same), so its normalized value should be >= t2's
          expect(seconds1).toBeGreaterThanOrEqual(seconds2);
        },
      ),
    );
  });
});

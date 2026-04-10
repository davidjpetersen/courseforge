import { describe, expect, it } from 'vitest';

import { getStatusBadge, STATUS_BADGE_MAP } from './status-badge';
import { RunStatus } from '../../packages/types/src/events';

describe('Status Badge', () => {
  describe('STATUS_BADGE_MAP', () => {
    it('maps SUCCESS to green with no animation', () => {
      const badge = STATUS_BADGE_MAP[RunStatus.SUCCESS];
      expect(badge.label).toBe('Success');
      expect(badge.colorClass).toContain('green');
      expect(badge.animate).toBe(false);
    });

    it('maps FAILED to red with no animation', () => {
      const badge = STATUS_BADGE_MAP[RunStatus.FAILED];
      expect(badge.label).toBe('Failed');
      expect(badge.colorClass).toContain('red');
      expect(badge.animate).toBe(false);
    });

    it('maps RUNNING to amber with animation', () => {
      const badge = STATUS_BADGE_MAP[RunStatus.RUNNING];
      expect(badge.label).toBe('Running');
      expect(badge.colorClass).toContain('amber');
      expect(badge.animate).toBe(true);
    });

    it('maps PENDING to gray with no animation', () => {
      const badge = STATUS_BADGE_MAP[RunStatus.PENDING];
      expect(badge.label).toBe('Pending');
      expect(badge.colorClass).toContain('gray');
      expect(badge.animate).toBe(false);
    });

    it('maps REPLAYING to blue with no animation', () => {
      const badge = STATUS_BADGE_MAP[RunStatus.REPLAYING];
      expect(badge.label).toBe('Replaying');
      expect(badge.colorClass).toContain('blue');
      expect(badge.animate).toBe(false);
    });
  });

  describe('getStatusBadge', () => {
    it('returns the correct view model for each status', () => {
      for (const status of Object.values(RunStatus)) {
        const badge = getStatusBadge(status);
        expect(badge).toEqual(STATUS_BADGE_MAP[status]);
      }
    });

    it('returns animate: true only for RUNNING', () => {
      const animatedStatuses = Object.values(RunStatus).filter(
        (s) => getStatusBadge(s).animate,
      );
      expect(animatedStatuses).toEqual([RunStatus.RUNNING]);
    });
  });
});

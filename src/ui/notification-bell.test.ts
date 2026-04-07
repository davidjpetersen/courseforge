import { describe, expect, it } from 'vitest';
import type { Notification } from '../../packages/types/src/runs.js';
import {
  createNotificationBellState,
  updateNotifications,
  markNotificationRead,
  markAllRead,
  toggleDropdown,
  getVisibleNotifications,
  shouldShowBadge,
  formatRelativeTime,
} from './notification-bell.js';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    notificationId: 'notif-1',
    type: 'run_failed',
    workflowId: 'wf-1',
    workflowName: 'Test Workflow',
    runId: 'run-1',
    failedStepName: 'Send Email',
    read: false,
    createdAt: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

describe('createNotificationBellState', () => {
  it('returns default state', () => {
    const state = createNotificationBellState();
    expect(state).toEqual({
      notifications: [],
      unreadCount: 0,
      isOpen: false,
      isPolling: false,
    });
  });
});

describe('updateNotifications', () => {
  it('replaces notifications and unreadCount', () => {
    const state = createNotificationBellState();
    const notifications = [makeNotification(), makeNotification({ notificationId: 'notif-2' })];
    const updated = updateNotifications(state, notifications, 2);

    expect(updated.notifications).toHaveLength(2);
    expect(updated.unreadCount).toBe(2);
  });

  it('preserves other state fields', () => {
    const state = { ...createNotificationBellState(), isOpen: true, isPolling: true };
    const updated = updateNotifications(state, [makeNotification()], 1);

    expect(updated.isOpen).toBe(true);
    expect(updated.isPolling).toBe(true);
  });
});

describe('markNotificationRead', () => {
  it('sets the matching notification to read and decrements unreadCount', () => {
    const state = {
      ...createNotificationBellState(),
      notifications: [makeNotification({ notificationId: 'n1', read: false })],
      unreadCount: 1,
    };

    const updated = markNotificationRead(state, 'n1');

    expect(updated.notifications[0].read).toBe(true);
    expect(updated.unreadCount).toBe(0);
  });

  it('does not change unreadCount for already-read notification', () => {
    const state = {
      ...createNotificationBellState(),
      notifications: [makeNotification({ notificationId: 'n1', read: true })],
      unreadCount: 0,
    };

    const updated = markNotificationRead(state, 'n1');

    expect(updated.unreadCount).toBe(0);
  });

  it('does not change state for non-existent notification ID', () => {
    const state = {
      ...createNotificationBellState(),
      notifications: [makeNotification({ notificationId: 'n1', read: false })],
      unreadCount: 1,
    };

    const updated = markNotificationRead(state, 'non-existent');

    expect(updated.notifications[0].read).toBe(false);
    expect(updated.unreadCount).toBe(1);
  });

  it('does not let unreadCount go below zero', () => {
    const state = {
      ...createNotificationBellState(),
      notifications: [makeNotification({ notificationId: 'n1', read: false })],
      unreadCount: 0,
    };

    const updated = markNotificationRead(state, 'n1');

    expect(updated.unreadCount).toBe(0);
  });
});

describe('markAllRead', () => {
  it('sets all notifications to read and unreadCount to zero', () => {
    const state = {
      ...createNotificationBellState(),
      notifications: [
        makeNotification({ notificationId: 'n1', read: false }),
        makeNotification({ notificationId: 'n2', read: false }),
        makeNotification({ notificationId: 'n3', read: true }),
      ],
      unreadCount: 2,
    };

    const updated = markAllRead(state);

    expect(updated.notifications.every((n) => n.read)).toBe(true);
    expect(updated.unreadCount).toBe(0);
  });

  it('works on empty notifications', () => {
    const state = createNotificationBellState();
    const updated = markAllRead(state);

    expect(updated.notifications).toEqual([]);
    expect(updated.unreadCount).toBe(0);
  });
});

describe('toggleDropdown', () => {
  it('opens a closed dropdown', () => {
    const state = createNotificationBellState();
    expect(state.isOpen).toBe(false);

    const updated = toggleDropdown(state);
    expect(updated.isOpen).toBe(true);
  });

  it('closes an open dropdown', () => {
    const state = { ...createNotificationBellState(), isOpen: true };

    const updated = toggleDropdown(state);
    expect(updated.isOpen).toBe(false);
  });

  it('toggles back and forth', () => {
    let state = createNotificationBellState();
    state = toggleDropdown(state);
    expect(state.isOpen).toBe(true);
    state = toggleDropdown(state);
    expect(state.isOpen).toBe(false);
  });
});

describe('getVisibleNotifications', () => {
  it('returns up to 5 notifications by default', () => {
    const notifications = Array.from({ length: 8 }, (_, i) =>
      makeNotification({ notificationId: `n${i}` }),
    );
    const state = { ...createNotificationBellState(), notifications };

    const visible = getVisibleNotifications(state);

    expect(visible).toHaveLength(5);
    expect(visible.map((n) => n.notificationId)).toEqual(['n0', 'n1', 'n2', 'n3', 'n4']);
  });

  it('respects a custom limit', () => {
    const notifications = Array.from({ length: 8 }, (_, i) =>
      makeNotification({ notificationId: `n${i}` }),
    );
    const state = { ...createNotificationBellState(), notifications };

    const visible = getVisibleNotifications(state, 3);

    expect(visible).toHaveLength(3);
  });

  it('returns all notifications when fewer than limit', () => {
    const notifications = [makeNotification({ notificationId: 'n0' }), makeNotification({ notificationId: 'n1' })];
    const state = { ...createNotificationBellState(), notifications };

    const visible = getVisibleNotifications(state, 10);

    expect(visible).toHaveLength(2);
  });

  it('returns empty array for empty state', () => {
    const state = createNotificationBellState();
    expect(getVisibleNotifications(state)).toEqual([]);
  });
});

describe('shouldShowBadge', () => {
  it('returns true when unreadCount is greater than zero', () => {
    const state = { ...createNotificationBellState(), unreadCount: 3 };
    expect(shouldShowBadge(state)).toBe(true);
  });

  it('returns false when unreadCount is zero', () => {
    const state = createNotificationBellState();
    expect(shouldShowBadge(state)).toBe(false);
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2024-01-15T12:00:00Z');

  it('returns "just now" for less than 60 seconds ago', () => {
    expect(formatRelativeTime('2024-01-15T11:59:30Z', now)).toBe('just now');
  });

  it('returns "just now" at exactly 0 seconds', () => {
    expect(formatRelativeTime('2024-01-15T12:00:00Z', now)).toBe('just now');
  });

  it('returns "just now" at 59 seconds', () => {
    expect(formatRelativeTime('2024-01-15T11:59:01Z', now)).toBe('just now');
  });

  it('returns "1 min ago" at exactly 60 seconds', () => {
    expect(formatRelativeTime('2024-01-15T11:59:00Z', now)).toBe('1 min ago');
  });

  it('returns "59 min ago" at 59 minutes', () => {
    expect(formatRelativeTime('2024-01-15T11:01:00Z', now)).toBe('59 min ago');
  });

  it('returns "1 hr ago" at exactly 60 minutes', () => {
    expect(formatRelativeTime('2024-01-15T11:00:00Z', now)).toBe('1 hr ago');
  });

  it('returns "23 hr ago" at 23 hours', () => {
    expect(formatRelativeTime('2024-01-14T13:00:00Z', now)).toBe('23 hr ago');
  });

  it('returns "1 days ago" at exactly 24 hours', () => {
    expect(formatRelativeTime('2024-01-14T12:00:00Z', now)).toBe('1 days ago');
  });

  it('returns "3 days ago" for 3 days', () => {
    expect(formatRelativeTime('2024-01-12T12:00:00Z', now)).toBe('3 days ago');
  });
});

import type { Notification } from '../../packages/types/src/runs';

export interface NotificationBellState {
  notifications: Notification[];
  unreadCount: number;
  isOpen: boolean;
  isPolling: boolean;
}

export function createNotificationBellState(): NotificationBellState {
  return {
    notifications: [],
    unreadCount: 0,
    isOpen: false,
    isPolling: false,
  };
}

export function updateNotifications(
  state: NotificationBellState,
  notifications: Notification[],
  unreadCount: number,
): NotificationBellState {
  return { ...state, notifications, unreadCount };
}

export function markNotificationRead(
  state: NotificationBellState,
  notificationId: string,
): NotificationBellState {
  const notifications = state.notifications.map((n) =>
    n.notificationId === notificationId ? { ...n, read: true } : n,
  );
  const found = state.notifications.some(
    (n) => n.notificationId === notificationId && !n.read,
  );
  const unreadCount = found
    ? Math.max(0, state.unreadCount - 1)
    : state.unreadCount;
  return { ...state, notifications, unreadCount };
}

export function markAllRead(state: NotificationBellState): NotificationBellState {
  const notifications = state.notifications.map((n) => ({ ...n, read: true }));
  return { ...state, notifications, unreadCount: 0 };
}

export function toggleDropdown(state: NotificationBellState): NotificationBellState {
  return { ...state, isOpen: !state.isOpen };
}

export function getVisibleNotifications(
  state: NotificationBellState,
  limit: number = 5,
): Notification[] {
  return state.notifications.slice(0, limit);
}

export function shouldShowBadge(state: NotificationBellState): boolean {
  return state.unreadCount > 0;
}

export function formatRelativeTime(createdAt: string, now?: Date): string {
  const current = now ?? new Date();
  const created = new Date(createdAt);
  const diffMs = current.getTime() - created.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) {
    return 'just now';
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} days ago`;
}

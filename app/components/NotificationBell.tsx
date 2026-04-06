'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { Notification } from '../../packages/types/src/runs';

function relativeTime(input: string): string {
  const diffMs = Date.now() - new Date(input).getTime();
  const diffMin = Math.max(1, Math.floor(diffMs / 60_000));
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  return `${Math.floor(diffHr / 24)} d ago`;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch('/api/notifications');
    const data = (await res.json()) as { notifications: Notification[]; unreadCount: number };
    setNotifications(data.notifications);
    setUnreadCount(data.unreadCount);
  }

  async function markAllRead() {
    setBusy(true);
    try {
      await Promise.all(
        notifications
          .filter((notification) => !notification.read)
          .map((notification) =>
            fetch(`/api/notifications/${notification.notificationId}/read`, { method: 'POST' }),
          ),
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function openNotification(notification: Notification) {
    setBusy(true);
    try {
      await fetch(`/api/notifications/${notification.notificationId}/read`, { method: 'POST' });
      await refresh();
      setOpen(false);
      router.push(`/runs/${notification.runId}`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative">
      <button
        className="relative rounded p-2"
        aria-label="Notifications"
        onClick={() => setOpen((value) => !value)}
      >
        🔔
        {unreadCount > 0 ? (
          <span className="absolute right-0 top-0 rounded-full bg-red-600 px-1 text-xs text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-10 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <ul className="space-y-1">
            {notifications.slice(0, 5).map((notification) => (
              <li key={notification.notificationId}>
                <button
                  className="w-full rounded-lg p-2 text-left hover:bg-slate-50"
                  disabled={busy}
                  onClick={() => void openNotification(notification)}
                >
                  <div className="text-sm font-medium text-slate-900">{notification.workflowName}</div>
                  <div className="text-xs text-slate-600">
                    {notification.failedStepName} · {relativeTime(notification.createdAt)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <button
            className="mt-2 text-xs text-blue-700 hover:underline disabled:text-slate-400"
            disabled={busy || unreadCount === 0}
            onClick={() => void markAllRead()}
          >
            Mark all as read
          </button>
        </div>
      ) : null}
    </div>
  );
}

'use client';

import Link from 'next/link';
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
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  async function refresh() {
    const res = await fetch('/api/notifications');
    const data = (await res.json()) as { notifications: Notification[]; unreadCount: number };
    setNotifications(data.notifications);
    setUnreadCount(data.unreadCount);
  }

  async function markRead(notificationId: string) {
    await fetch(`/api/notifications/${notificationId}/read`, { method: 'POST' });
    await refresh();
  }

  async function markAllRead() {
    await Promise.all(
      notifications.filter((n) => !n.read).map((n) => markRead(n.notificationId)),
    );
  }

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative">
      <button className="relative rounded p-2" onClick={() => setOpen((v) => !v)}>
        🔔
        {unreadCount > 0 ? <span className="absolute right-0 top-0 rounded-full bg-red-600 px-1 text-xs text-white">{unreadCount}</span> : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-10 w-80 rounded border bg-white p-2 shadow">
          <ul className="space-y-1">
            {notifications.slice(0, 5).map((n) => (
              <li key={n.notificationId} className="rounded p-2 hover:bg-gray-50">
                <Link href={`/runs/${n.runId}`} onClick={() => void markRead(n.notificationId)}>
                  <div className="text-sm font-medium">{n.workflowName}</div>
                  <div className="text-xs text-gray-600">{n.failedStepName} · {relativeTime(n.createdAt)}</div>
                </Link>
              </li>
            ))}
          </ul>
          <button className="mt-2 text-xs text-blue-700 hover:underline" onClick={() => void markAllRead()}>Mark all as read</button>
        </div>
      ) : null}
    </div>
  );
}

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createNotificationsHandler,
  createNotificationReadHandler,
  NotificationRepository,
} from './handler';
import type { APIGatewayProxyEvent } from '../triggers/shared';
import type { Notification } from '../../../packages/types/src/runs';

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/api/notifications',
    headers: { 'x-user-id': 'user-1' },
    queryStringParameters: null,
    ...overrides,
  };
}

function makeReadEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/api/notifications/notif-1/read',
    headers: { 'x-user-id': 'user-1' },
    pathParameters: { notificationId: 'notif-1' },
    queryStringParameters: null,
    ...overrides,
  };
}

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    notificationId: 'notif-1',
    type: 'run_failed',
    workflowId: 'wf-1',
    workflowName: 'My Workflow',
    runId: 'run-1',
    failedStepName: 'Step 3',
    read: false,
    createdAt: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

function makeMockRepo(): NotificationRepository {
  return {
    queryByUser: vi.fn().mockResolvedValue([]),
    markRead: vi.fn().mockResolvedValue(true),
  };
}

describe('createNotificationsHandler', () => {
  let mockRepo: NotificationRepository;

  beforeEach(() => {
    mockRepo = makeMockRepo();
  });

  it('returns notifications with unread items first, then read items', async () => {
    const readNotif = makeNotification({ notificationId: 'notif-read', read: true, createdAt: '2024-01-15T09:00:00Z' });
    const unreadNotif = makeNotification({ notificationId: 'notif-unread', read: false, createdAt: '2024-01-15T10:00:00Z' });
    (mockRepo.queryByUser as ReturnType<typeof vi.fn>).mockResolvedValue([readNotif, unreadNotif]);

    const handler = createNotificationsHandler(mockRepo);
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.notifications).toHaveLength(2);
    expect(body.notifications[0].notificationId).toBe('notif-unread');
    expect(body.notifications[1].notificationId).toBe('notif-read');
  });

  it('returns correct unreadCount', async () => {
    const notifications = [
      makeNotification({ notificationId: 'n1', read: false }),
      makeNotification({ notificationId: 'n2', read: false }),
      makeNotification({ notificationId: 'n3', read: true }),
    ];
    (mockRepo.queryByUser as ReturnType<typeof vi.fn>).mockResolvedValue(notifications);

    const handler = createNotificationsHandler(mockRepo);
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.unreadCount).toBe(2);
  });

  it('returns 400 when x-user-id header is missing', async () => {
    const handler = createNotificationsHandler(mockRepo);
    const response = await handler(makeEvent({ headers: {} }));

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.message).toMatch(/x-user-id/i);
  });

  it('calls queryByUser with userId and limit 20', async () => {
    const handler = createNotificationsHandler(mockRepo);
    await handler(makeEvent());

    expect(mockRepo.queryByUser).toHaveBeenCalledWith('user-1', 20);
  });
});

describe('createNotificationReadHandler', () => {
  let mockRepo: NotificationRepository;

  beforeEach(() => {
    mockRepo = makeMockRepo();
  });

  it('returns 204 when markRead succeeds', async () => {
    const handler = createNotificationReadHandler(mockRepo);
    const response = await handler(makeReadEvent());

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(mockRepo.markRead).toHaveBeenCalledWith('user-1', 'notif-1', expect.any(String));
  });

  it('returns 404 when markRead returns false', async () => {
    (mockRepo.markRead as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const handler = createNotificationReadHandler(mockRepo);
    const response = await handler(makeReadEvent());

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.message).toMatch(/not found/i);
  });

  it('returns 400 when x-user-id header is missing', async () => {
    const handler = createNotificationReadHandler(mockRepo);
    const response = await handler(makeReadEvent({ headers: {} }));

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.message).toMatch(/x-user-id/i);
  });

  it('returns 400 when notificationId path parameter is missing', async () => {
    const handler = createNotificationReadHandler(mockRepo);
    const response = await handler(makeReadEvent({ pathParameters: null }));

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.message).toMatch(/notificationId/i);
  });
});

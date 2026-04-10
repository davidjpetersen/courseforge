import type { Notification } from '../../../packages/types/src/runs';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from '../triggers/shared';
import { jsonResponse, getHeader } from '../triggers/shared';

export interface NotificationRepository {
  queryByUser(userId: string, limit: number): Promise<Notification[]>;
  markRead(userId: string, notificationId: string, readAt: string): Promise<boolean>;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

export function createNotificationsHandler(repo: NotificationRepository) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const userId = getHeader(event.headers, 'x-user-id');
    if (!userId) {
      return jsonResponse(400, { message: 'Missing x-user-id header' });
    }

    const notifications = await repo.queryByUser(userId, 20);

    const unread = notifications.filter((n) => !n.read);
    const read = notifications.filter((n) => n.read);
    const sorted = [...unread, ...read];

    const response: NotificationsResponse = {
      notifications: sorted,
      unreadCount: unread.length,
    };

    return jsonResponse(200, response);
  };
}

export function createNotificationReadHandler(repo: NotificationRepository) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const userId = getHeader(event.headers, 'x-user-id');
    if (!userId) {
      return jsonResponse(400, { message: 'Missing x-user-id header' });
    }

    const notificationId = event.pathParameters?.notificationId;
    if (!notificationId) {
      return jsonResponse(400, { message: 'Missing notificationId path parameter' });
    }

    const readAt = new Date().toISOString();
    const success = await repo.markRead(userId, notificationId, readAt);

    if (!success) {
      return jsonResponse(404, { message: 'Notification not found' });
    }

    return { statusCode: 204, headers: {}, body: '' };
  };
}

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

import type { Notification } from '../../../packages/types/src/runs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.NOTIFICATIONS_TABLE_NAME ?? 'CourseForgeNotifications';

function getUserId(request: NextRequest): string {
  return request.headers.get('x-user-id') ?? process.env.DEFAULT_USER_ID ?? 'CURRENT';
}

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  const res = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'NOTIFICATION#',
      },
      Limit: 20,
      ScanIndexForward: false,
    }),
  );

  const notifications = (res.Items ?? []) as Notification[];
  const unread = notifications.filter((notification) => !notification.read);
  const read = notifications.filter((notification) => notification.read);

  return NextResponse.json({
    notifications: [...unread, ...read],
    unreadCount: unread.length,
  });
}

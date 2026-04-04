import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { NextResponse } from 'next/server';

import type { Notification } from '../../../packages/types/src/runs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.NOTIFICATIONS_TABLE_NAME ?? 'CourseForgeNotifications';

export async function GET() {
  const userId = 'CURRENT';
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
  const sorted = [...notifications].sort((a, b) => Number(a.read) - Number(b.read));

  return NextResponse.json({
    notifications: sorted,
    unreadCount: notifications.filter((n) => !n.read).length,
  });
}

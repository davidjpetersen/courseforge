import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { NextResponse } from 'next/server';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.NOTIFICATIONS_TABLE_NAME ?? 'CourseForgeNotifications';

export async function POST(_: Request, context: { params: Promise<{ notificationId: string }> }) {
  const userId = 'CURRENT';
  const { notificationId } = await context.params;

  await ddb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { PK: `USER#${userId}`, SK: `NOTIFICATION#${notificationId}` },
      UpdateExpression: 'SET #read = :read, readAt = :readAt',
      ExpressionAttributeNames: { '#read': 'read' },
      ExpressionAttributeValues: { ':read': true, ':readAt': new Date().toISOString() },
    }),
  );

  return new NextResponse(null, { status: 204 });
}

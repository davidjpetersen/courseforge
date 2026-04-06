import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { NextResponse } from 'next/server';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.NOTIFICATIONS_TABLE_NAME ?? 'CourseForgeNotifications';

function getUserId(request: Request): string {
  return request.headers.get('x-user-id') ?? process.env.DEFAULT_USER_ID ?? 'CURRENT';
}

export async function POST(request: Request, context: { params: Promise<{ notificationId: string }> }) {
  const userId = getUserId(request);
  const { notificationId } = await context.params;

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { PK: `USER#${userId}`, SK: `NOTIFICATION#${notificationId}` },
        ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
        UpdateExpression: 'SET #read = :read, readAt = :readAt',
        ExpressionAttributeNames: { '#read': 'read' },
        ExpressionAttributeValues: { ':read': true, ':readAt': new Date().toISOString() },
      }),
    );
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    throw error;
  }

  return new NextResponse(null, { status: 204 });
}

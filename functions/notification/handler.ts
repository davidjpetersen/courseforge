import { randomUUID } from 'node:crypto';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

export interface RunFailedEvent {
  detail: {
    tenantId: string;
    workflowId: string;
    runId: string;
    workflowName?: string;
    failedStepName?: string;
  };
}

export interface NotificationDeps {
  dynamoClient: Pick<DynamoDBDocumentClient, 'send'>;
  mainTableName: string;
  clock?: () => Date;
  uuid?: () => string;
}

interface NotificationPreferences {
  workflowId?: string;
}

function isSubscribed(
  prefs: NotificationPreferences | undefined,
  workflowId: string,
): boolean {
  return prefs?.workflowId === 'all' || prefs?.workflowId === workflowId;
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

export function createNotificationHandler(deps: NotificationDeps) {
  const now = deps.clock ?? (() => new Date());
  const uuid = deps.uuid ?? randomUUID;

  return async (event: RunFailedEvent): Promise<void> => {
    const createdAt = now().toISOString();
    const { tenantId, workflowId, runId } = event.detail;

    const users = await deps.dynamoClient.send(
      new QueryCommand({
        TableName: deps.mainTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `TENANT#${tenantId}`,
          ':sk': 'USER#',
        },
      }),
    );

    const notifications = (users.Items ?? [])
      .filter((user) => isSubscribed(user.notificationPrefs as NotificationPreferences | undefined, workflowId))
      .map((user) => {
        const notificationId = uuid();

        return {
          PutRequest: {
            Item: {
              PK: `USER#${user.userId}`,
              SK: `NOTIFICATION#${createdAt}#${notificationId}`,
              type: 'RUN_FAILED',
              workflowId,
              runId,
              workflowName: event.detail.workflowName,
              failedStepName: event.detail.failedStepName,
              read: false,
              createdAt,
            },
          },
        };
      });

    for (const batch of chunkItems(notifications, 25)) {
      await deps.dynamoClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [deps.mainTableName]: batch,
          },
        }),
      );
    }
  };
}

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = createNotificationHandler({
  dynamoClient,
  mainTableName: process.env.MAIN_TABLE_NAME ?? '',
});

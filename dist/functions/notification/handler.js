import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
export function createNotificationHandler(deps) {
    const now = deps.clock ?? (() => new Date());
    const uuid = deps.uuid ?? randomUUID;
    return async (event) => {
        const createdAt = now().toISOString();
        const { tenantId, workflowId, runId } = event.detail;
        const users = await deps.dynamoClient.send(new QueryCommand({
            TableName: deps.mainTableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
                ':pk': `TENANT#${tenantId}`,
                ':sk': 'USER#',
            },
        }));
        for (const user of users.Items ?? []) {
            const prefs = user.notificationPrefs;
            if (prefs?.workflowId && prefs.workflowId !== 'all' && prefs.workflowId !== workflowId) {
                continue;
            }
            const notificationId = uuid();
            await deps.dynamoClient.send(new PutCommand({
                TableName: deps.mainTableName,
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
            }));
        }
    };
}
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const handler = createNotificationHandler({
    dynamoClient,
    mainTableName: process.env.MAIN_TABLE_NAME ?? '',
});
//# sourceMappingURL=handler.js.map
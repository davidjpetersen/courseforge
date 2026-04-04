import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { auditSK, tenantPK } from '../../src/models/schema.js';
export function createRunFinalizerHandler(deps) {
    const now = deps.clock ?? (() => new Date());
    return async (event) => {
        const endedAtDate = now();
        const endedAt = endedAtDate.toISOString();
        const runRecord = await deps.dynamoClient.send(new GetCommand({
            TableName: deps.mainTableName,
            Key: { PK: `RUN#${event.runId}`, SK: 'META' },
        }));
        const startedAtIso = runRecord.Item?.startedAt ?? endedAt;
        const durationMs = endedAtDate.getTime() - new Date(startedAtIso).getTime();
        await deps.dynamoClient.send(new UpdateCommand({
            TableName: deps.mainTableName,
            Key: { PK: `RUN#${event.runId}`, SK: 'META' },
            UpdateExpression: 'SET #status = :status, endedAt = :endedAt, durationMs = :durationMs, #error = :error',
            ExpressionAttributeNames: { '#status': 'status', '#error': 'error' },
            ExpressionAttributeValues: {
                ':status': event.status,
                ':endedAt': endedAt,
                ':durationMs': durationMs,
                ':error': event.status === 'FAILED'
                    ? {
                        failedStepId: event.error?.failedStepId,
                        errorMessage: event.error?.message,
                        errorCode: event.error?.code,
                    }
                    : null,
            },
        }));
        const actionType = event.status === 'FAILED' ? 'RUN_FAILED' : 'RUN_COMPLETED';
        await deps.dynamoClient.send(new PutCommand({
            TableName: deps.mainTableName,
            Item: {
                PK: tenantPK(event.tenantId),
                SK: auditSK(endedAt, event.runId),
                actionType,
                resourceId: event.runId,
                createdAt: endedAt,
            },
        }));
        await deps.eventBridgeClient.putEvents({
            Entries: [
                {
                    EventBusName: deps.eventBusName,
                    Source: 'courseforge.run',
                    DetailType: event.status === 'FAILED' ? 'RunFailed' : 'RunCompleted',
                    Detail: JSON.stringify({
                        tenantId: event.tenantId,
                        workflowId: event.workflowId,
                        runId: event.runId,
                        status: event.status,
                        durationMs,
                    }),
                },
            ],
        });
        return { runId: event.runId, status: event.status };
    };
}
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const handler = createRunFinalizerHandler({
    dynamoClient,
    eventBridgeClient: {
        async putEvents() {
            return {};
        },
    },
    mainTableName: process.env.MAIN_TABLE_NAME ?? '',
    eventBusName: process.env.EVENT_BUS_NAME ?? '',
});
//# sourceMappingURL=handler.js.map
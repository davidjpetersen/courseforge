import { auditEntryPK, auditEntrySK } from '../shared/keys.js';
import { findRunRecordById } from '../shared/run-records.js';
export function createRunFinalizerHandler(deps) {
    const now = deps.clock ?? (() => new Date());
    return async (input) => {
        const runRecord = await findRunRecordById(deps.dynamoClient, deps.mainTableName, input.tenantId, input.runId);
        if (!runRecord) {
            throw new Error(`run not found: ${input.runId}`);
        }
        const endedAt = now().toISOString();
        const startedAt = typeof runRecord.startedAt === 'string' ? Date.parse(runRecord.startedAt) : NaN;
        const durationMs = Number.isFinite(startedAt) ? Math.max(0, Date.parse(endedAt) - startedAt) : 0;
        await deps.dynamoClient.update({
            TableName: deps.mainTableName,
            Key: { PK: runRecord.PK, SK: runRecord.SK },
            UpdateExpression: 'SET #status = :status, endedAt = :endedAt, durationMs = :durationMs, failedStepId = :failedStepId, errorMessage = :errorMessage, errorCode = :errorCode',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':status': input.status,
                ':endedAt': endedAt,
                ':durationMs': durationMs,
                ':failedStepId': input.error?.failedStepId ?? null,
                ':errorMessage': input.error?.errorMessage ?? null,
                ':errorCode': input.error?.errorCode ?? null,
            },
        });
        const auditEntry = {
            PK: auditEntryPK(input.tenantId),
            SK: auditEntrySK(endedAt, input.runId),
            tenantId: input.tenantId,
            actionType: input.status === 'SUCCESS' ? 'RUN_COMPLETED' : 'RUN_FAILED',
            runId: input.runId,
            workflowId: input.workflowId,
            status: input.status,
            durationMs,
            createdAt: endedAt,
        };
        await deps.dynamoClient.put({
            TableName: deps.mainTableName,
            Item: auditEntry,
        });
        await deps.eventBridgeClient.putEvents({
            Entries: [
                {
                    EventBusName: deps.eventBusName,
                    Source: 'courseforge.run',
                    DetailType: input.status === 'SUCCESS' ? 'RunCompleted' : 'RunFailed',
                    Detail: JSON.stringify({
                        tenantId: input.tenantId,
                        workflowId: input.workflowId,
                        runId: input.runId,
                        status: input.status,
                        durationMs,
                    }),
                },
            ],
        });
        return { runId: input.runId, status: input.status };
    };
}
//# sourceMappingURL=handler.js.map
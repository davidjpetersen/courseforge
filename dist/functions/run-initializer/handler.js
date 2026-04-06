import { RunStatus } from '../../packages/types/src/index.js';
import { workflowMetaSK, workflowPK } from '../../src/models/schema.js';
import { findRunRecordById } from '../shared/run-records.js';
import { workflowVersionPK, workflowVersionSK } from '../shared/keys.js';
function parseCompiledPlan(compiledPlan) {
    if (typeof compiledPlan === 'string') {
        return JSON.parse(compiledPlan);
    }
    if (Array.isArray(compiledPlan)) {
        return compiledPlan;
    }
    return [];
}
export function createRunInitializerHandler(deps) {
    const now = deps.clock ?? (() => new Date());
    return async (input) => {
        const workflowMeta = await deps.dynamoClient.get({
            TableName: deps.mainTableName,
            Key: {
                PK: workflowPK(input.workflowId),
                SK: workflowMetaSK(),
            },
        });
        if (!workflowMeta.Item) {
            throw new Error('workflow not found');
        }
        const versionId = workflowMeta.Item.publishedVersionId;
        if (typeof versionId !== 'string' || versionId.length === 0) {
            throw new Error('no published version');
        }
        const version = await deps.dynamoClient.get({
            TableName: deps.mainTableName,
            Key: {
                PK: workflowVersionPK(input.workflowId),
                SK: workflowVersionSK(versionId),
            },
        });
        if (!version.Item) {
            throw new Error('workflow not found');
        }
        const runRecord = await findRunRecordById(deps.dynamoClient, deps.mainTableName, input.tenantId, input.runId);
        if (!runRecord) {
            throw new Error(`run not found: ${input.runId}`);
        }
        const startedAt = now().toISOString();
        await deps.dynamoClient.update({
            TableName: deps.mainTableName,
            Key: {
                PK: runRecord.PK,
                SK: runRecord.SK,
            },
            UpdateExpression: 'SET #status = :status, versionId = :versionId, startedAt = :startedAt, payload = :payload, traceId = :traceId',
            ExpressionAttributeNames: {
                '#status': 'status',
            },
            ExpressionAttributeValues: {
                ':status': RunStatus.RUNNING,
                ':versionId': versionId,
                ':startedAt': startedAt,
                ':payload': input.payload,
                ':traceId': input.traceId,
            },
        });
        return {
            steps: parseCompiledPlan(version.Item.compiledPlan),
            workflowId: input.workflowId,
            runId: input.runId,
            tenantId: input.tenantId,
            traceId: input.traceId,
            payload: input.payload,
            versionId,
        };
    };
}
//# sourceMappingURL=handler.js.map
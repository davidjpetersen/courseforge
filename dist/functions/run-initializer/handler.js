import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand, } from '@aws-sdk/lib-dynamodb';
import { RunStatus } from '../../packages/types/src/index.js';
import { tenantPK, workflowSK } from '../../src/models/schema.js';
import { findRunRecordById } from '../shared/run-records.js';
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
                PK: tenantPK(input.tenantId),
                SK: workflowSK(input.workflowId),
            },
        });
        if (!workflowMeta.Item) {
            throw new Error('workflow not found');
        }
        const versionId = workflowMeta.Item.currentVersionId;
        if (workflowMeta.Item.status !== 'PUBLISHED' ||
            typeof versionId !== 'string' ||
            versionId.length === 0) {
            throw new Error('no published version');
        }
        const versions = await deps.dynamoClient.query({
            TableName: deps.mainTableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
            ExpressionAttributeValues: {
                ':pk': workflowSK(input.workflowId),
                ':skPrefix': 'VERSION#',
            },
        });
        const version = (versions.Items ?? []).find((item) => item.versionId === versionId);
        if (!version) {
            throw new Error('no published version');
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
            steps: parseCompiledPlan(version.compiledPlan),
            workflowId: input.workflowId,
            runId: input.runId,
            tenantId: input.tenantId,
            traceId: input.traceId,
            payload: input.payload,
            versionId,
        };
    };
}
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const handler = createRunInitializerHandler({
    dynamoClient: {
        async get(params) {
            return dynamoClient.send(new GetCommand(params));
        },
        async query(params) {
            const result = await dynamoClient.send(new QueryCommand(params));
            return { Items: result.Items };
        },
        async update(params) {
            return dynamoClient.send(new UpdateCommand(params));
        },
    },
    mainTableName: process.env.MAIN_TABLE_NAME ?? '',
});
//# sourceMappingURL=handler.js.map
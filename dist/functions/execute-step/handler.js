import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { resolveConnector } from '../../packages/connectors/registry.js';
const MAX_INLINE_OUTPUT_BYTES = 4096;
export function createExecuteStepHandler(deps) {
    const now = deps.clock ?? (() => new Date());
    return async (event) => {
        const startedAtDate = now();
        const startedAt = startedAtDate.toISOString();
        const stepKey = `STEP#${event.step.stepIndex}#${event.step.stepId}`;
        await deps.dynamoClient.send(new UpdateCommand({
            TableName: deps.mainTableName,
            Key: { PK: `RUN#${event.runId}`, SK: stepKey },
            UpdateExpression: 'SET #status = :status, startedAt = :startedAt',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':status': 'RUNNING', ':startedAt': startedAt },
        }));
        const connector = resolveConnector(event.step.connectorKey);
        const subsegment = {
            close: (..._args) => undefined,
            addError: (..._args) => undefined,
        };
        try {
            const result = await connector.run(event.step.params, {
                variables: Object.fromEntries(Object.entries(event.accumulatedContext ?? {}).map(([key, value]) => [key, String(value)])),
                workflowId: 'unknown',
                tenantId: event.tenantId,
                traceId: event.traceId,
            });
            const endedAtDate = now();
            const endedAt = endedAtDate.toISOString();
            const durationMs = endedAtDate.getTime() - startedAtDate.getTime();
            const outputJson = JSON.stringify(result ?? null);
            let outputRef;
            let inlineOutput = result;
            if (Buffer.byteLength(outputJson, 'utf8') > MAX_INLINE_OUTPUT_BYTES) {
                outputRef = `runs/${event.runId}/steps/${event.step.stepId}/${randomUUID()}.json`;
                await deps.s3Client.putObject({
                    Bucket: deps.artifactBucketName,
                    Key: outputRef,
                    Body: outputJson,
                    ContentType: 'application/json',
                });
                inlineOutput = undefined;
            }
            await deps.dynamoClient.send(new UpdateCommand({
                TableName: deps.mainTableName,
                Key: { PK: `RUN#${event.runId}`, SK: stepKey },
                UpdateExpression: 'SET #status = :status, endedAt = :endedAt, output = :output, outputRef = :outputRef',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':status': 'SUCCESS',
                    ':endedAt': endedAt,
                    ':output': inlineOutput,
                    ':outputRef': outputRef,
                },
            }));
            await deps.cloudWatchClient.putMetricData({
                Namespace: 'courseforge',
                MetricData: [
                    { MetricName: 'StepExecutionDuration', Unit: 'Milliseconds', Value: durationMs },
                    { MetricName: 'StepSuccess', Unit: 'Count', Value: 1 },
                ],
            });
            subsegment?.close();
            return { ...event.accumulatedContext, [event.step.stepId]: result };
        }
        catch (error) {
            const endedAt = now().toISOString();
            const normalizedError = error;
            await deps.dynamoClient.send(new UpdateCommand({
                TableName: deps.mainTableName,
                Key: { PK: `RUN#${event.runId}`, SK: stepKey },
                UpdateExpression: 'SET #status = :status, endedAt = :endedAt, #error = :error',
                ExpressionAttributeNames: { '#status': 'status', '#error': 'error' },
                ExpressionAttributeValues: {
                    ':status': 'FAILED',
                    ':endedAt': endedAt,
                    ':error': {
                        message: normalizedError.message ?? 'Step execution failed',
                        code: normalizedError.code ?? 'STEP_EXECUTION_FAILED',
                        rawResponse: normalizedError.rawResponse,
                    },
                },
            }));
            subsegment?.addError(error, false);
            subsegment?.close();
            throw error;
        }
    };
}
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const handler = createExecuteStepHandler({
    dynamoClient,
    s3Client: {
        async putObject() {
            return {};
        },
    },
    cloudWatchClient: {
        async putMetricData() {
            return {};
        },
    },
    mainTableName: process.env.MAIN_TABLE_NAME ?? '',
    artifactBucketName: process.env.ARTIFACT_BUCKET_NAME ?? '',
});
//# sourceMappingURL=handler.js.map
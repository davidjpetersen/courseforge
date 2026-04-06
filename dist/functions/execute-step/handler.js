import { runtimeConnectorRegistry } from '../shared/connectors.js';
import { runStepRecordPK, runStepRecordSK } from '../shared/keys.js';
const INLINE_OUTPUT_LIMIT_BYTES = 4 * 1024;
function toRunStepError(error) {
    const value = error;
    return {
        message: error instanceof Error ? error.message : 'Step execution failed',
        code: typeof value.code === 'string' ? value.code : error instanceof Error ? error.name : 'StepExecutionFailed',
        rawResponse: value.rawResponse,
    };
}
function getOutputSizeBytes(output) {
    return Buffer.byteLength(JSON.stringify(output), 'utf8');
}
export function createExecuteStepHandler(deps) {
    const now = deps.clock ?? (() => new Date());
    const connectors = deps.connectors ?? runtimeConnectorRegistry;
    const metrics = deps.metrics;
    return async (input) => {
        const startedAtIso = now().toISOString();
        const stepKey = {
            PK: runStepRecordPK(input.runId),
            SK: runStepRecordSK(input.step.stepIndex, input.step.stepId),
        };
        await deps.dynamoClient.put({
            TableName: deps.mainTableName,
            Item: {
                ...stepKey,
                runId: input.runId,
                stepId: input.step.stepId,
                stepIndex: input.step.stepIndex,
                connectorKey: input.step.connectorKey,
                status: 'RUNNING',
                startedAt: startedAtIso,
            },
        });
        const connector = connectors.get(input.step.connectorKey);
        if (!connector) {
            const error = { message: `Unknown connector: ${input.step.connectorKey}`, code: 'UnknownConnector' };
            await deps.dynamoClient.update({
                TableName: deps.mainTableName,
                Key: stepKey,
                UpdateExpression: 'SET #status = :status, endedAt = :endedAt, #error = :error',
                ExpressionAttributeNames: { '#status': 'status', '#error': 'error' },
                ExpressionAttributeValues: {
                    ':status': 'FAILED',
                    ':endedAt': now().toISOString(),
                    ':error': error,
                },
            });
            throw Object.assign(new Error(error.message), { code: error.code, failedStepId: input.step.stepId });
        }
        const startedAtMs = Date.now();
        try {
            const stepResult = await connector.run(input.step.params, {
                ...input.accumulatedContext,
                tenantId: input.tenantId,
                traceId: input.traceId,
            });
            const endedAt = now().toISOString();
            const durationMs = Date.now() - startedAtMs;
            const outputSize = getOutputSizeBytes(stepResult);
            const accumulatedContext = {
                ...input.accumulatedContext,
                [input.step.stepId]: stepResult,
            };
            if (outputSize <= INLINE_OUTPUT_LIMIT_BYTES) {
                await deps.dynamoClient.update({
                    TableName: deps.mainTableName,
                    Key: stepKey,
                    UpdateExpression: 'SET #status = :status, endedAt = :endedAt, output = :output',
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: {
                        ':status': 'SUCCESS',
                        ':endedAt': endedAt,
                        ':output': stepResult,
                    },
                });
            }
            else {
                const outputRef = `runs/${input.runId}/steps/${input.step.stepId}/output.json`;
                await deps.s3Client.putObject({
                    Bucket: deps.artifactBucketName,
                    Key: outputRef,
                    Body: JSON.stringify(stepResult),
                    ContentType: 'application/json',
                });
                await deps.dynamoClient.update({
                    TableName: deps.mainTableName,
                    Key: stepKey,
                    UpdateExpression: 'SET #status = :status, endedAt = :endedAt, outputRef = :outputRef',
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: {
                        ':status': 'SUCCESS',
                        ':endedAt': endedAt,
                        ':outputRef': outputRef,
                    },
                });
            }
            metrics?.putMetric('courseforge/StepExecutionDuration', durationMs, 'Milliseconds');
            metrics?.putMetric('courseforge/StepSuccess', 1, 'Count');
            return { accumulatedContext, stepResult };
        }
        catch (error) {
            const runStepError = toRunStepError(error);
            await deps.dynamoClient.update({
                TableName: deps.mainTableName,
                Key: stepKey,
                UpdateExpression: 'SET #status = :status, endedAt = :endedAt, #error = :error',
                ExpressionAttributeNames: { '#status': 'status', '#error': 'error' },
                ExpressionAttributeValues: {
                    ':status': 'FAILED',
                    ':endedAt': now().toISOString(),
                    ':error': runStepError,
                },
            });
            metrics?.putMetric('courseforge/StepSuccess', 0, 'Count');
            throw Object.assign(error instanceof Error ? error : new Error(runStepError.message), {
                code: runStepError.code,
                rawResponse: runStepError.rawResponse,
                failedStepId: input.step.stepId,
            });
        }
    };
}
//# sourceMappingURL=handler.js.map
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, } from '@aws-sdk/lib-dynamodb';
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
    const tracer = deps.tracer;
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
        const subsegment = tracer?.startSubsegment(`connector:${input.step.connectorKey}:${input.step.stepId}`);
        try {
            const connectorContext = {
                ...input.accumulatedContext,
                tenantId: input.tenantId,
                traceId: input.traceId,
            };
            const stepResult = await connector.run(input.step.params, {
                ...connectorContext,
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
            metrics?.putMetric('courseforge/StepSuccess', 1, 'Count');
            metrics?.putMetric('courseforge/StepExecutionDuration', durationMs, 'Milliseconds');
            subsegment?.close?.();
            return { accumulatedContext, stepResult };
        }
        catch (error) {
            const runStepError = toRunStepError(error);
            const durationMs = Date.now() - startedAtMs;
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
            if (error instanceof Error) {
                subsegment?.addError?.(error);
            }
            metrics?.putMetric('courseforge/StepSuccess', 0, 'Count');
            metrics?.putMetric('courseforge/StepExecutionDuration', durationMs, 'Milliseconds');
            subsegment?.close?.(error instanceof Error ? error : undefined);
            throw Object.assign(error instanceof Error ? error : new Error(runStepError.message), {
                code: runStepError.code,
                rawResponse: runStepError.rawResponse,
                failedStepId: input.step.stepId,
            });
        }
    };
}
let productionHandlerPromise;
async function createProductionTracer() {
    try {
        const awsXray = await import('aws-xray-sdk-core');
        const getSegment = awsXray.getSegment;
        if (!getSegment) {
            return undefined;
        }
        return {
            startSubsegment(name) {
                const segment = getSegment();
                return segment?.addNewSubsegment(name);
            },
        };
    }
    catch {
        return undefined;
    }
}
async function getProductionHandler() {
    productionHandlerPromise ??= (async () => {
        const { PutObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
        const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
        const s3Client = new S3Client({});
        const tracer = await createProductionTracer();
        return createExecuteStepHandler({
            dynamoClient: {
                async put(params) {
                    return dynamoClient.send(new PutCommand(params));
                },
                async update(params) {
                    return dynamoClient.send(new UpdateCommand(params));
                },
            },
            s3Client: {
                async putObject(params) {
                    return s3Client.send(new PutObjectCommand(params));
                },
            },
            mainTableName: process.env.MAIN_TABLE_NAME ?? '',
            artifactBucketName: process.env.ARTIFACT_BUCKET_NAME ?? '',
            tracer,
        });
    })();
    return productionHandlerPromise;
}
export async function handler(input) {
    const runtimeHandler = await getProductionHandler();
    return runtimeHandler(input);
}
//# sourceMappingURL=handler.js.map
import { describe, expect, it, vi } from 'vitest';
import { createExecuteStepHandler } from './handler.js';
const baseInput = {
    runId: 'run-1',
    tenantId: 'tenant-1',
    traceId: 'trace-1',
    accumulatedContext: { existing: true },
    step: {
        stepId: 'step-1',
        stepIndex: 0,
        connectorKey: 'echo',
        actionType: 'echo',
        params: { value: 'hello' },
        retryPolicy: { maxAttempts: 2, backoffRate: 2 },
    },
};
describe('createExecuteStepHandler', () => {
    it('stores output inline when it is 4KB or smaller', async () => {
        const put = vi.fn(async () => ({}));
        const update = vi.fn(async () => ({}));
        const putObject = vi.fn(async () => ({}));
        const handler = createExecuteStepHandler({
            dynamoClient: { put, update },
            s3Client: { putObject },
            mainTableName: 'courseforge-main',
            artifactBucketName: 'artifacts',
        });
        const result = await handler(baseInput);
        const updateCall = update.mock.calls[0][0];
        expect(result.accumulatedContext['step-1']).toEqual({ value: 'hello' });
        expect(putObject).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalledOnce();
        expect(updateCall.ExpressionAttributeValues[':output']).toEqual({ value: 'hello' });
    });
    it('offloads output to S3 when it exceeds 4KB', async () => {
        const update = vi.fn(async () => ({}));
        const putObject = vi.fn(async () => ({}));
        const largeOutput = { blob: 'x'.repeat(5000) };
        const handler = createExecuteStepHandler({
            dynamoClient: { put: vi.fn(async () => ({})), update },
            s3Client: { putObject },
            mainTableName: 'courseforge-main',
            artifactBucketName: 'artifacts',
            connectors: new Map([
                ['echo', { run: async () => largeOutput }],
            ]),
        });
        await handler(baseInput);
        const updateCall = update.mock.calls[0][0];
        expect(putObject).toHaveBeenCalledOnce();
        expect(updateCall.ExpressionAttributeValues[':outputRef']).toBe('runs/run-1/steps/step-1/output.json');
    });
    it('records step failure and rethrows the error', async () => {
        const update = vi.fn(async () => ({}));
        const handler = createExecuteStepHandler({
            dynamoClient: { put: vi.fn(async () => ({})), update },
            s3Client: { putObject: vi.fn(async () => ({})) },
            mainTableName: 'courseforge-main',
            artifactBucketName: 'artifacts',
            connectors: new Map([
                ['echo', { run: async () => { throw Object.assign(new Error('boom'), { code: 'ConnectorError' }); } }],
            ]),
        });
        await expect(handler(baseInput)).rejects.toThrow('boom');
        const updateCall = update.mock.calls[0][0];
        expect(update).toHaveBeenCalledOnce();
        expect(updateCall.ExpressionAttributeValues[':error']).toMatchObject({
            message: 'boom',
            code: 'ConnectorError',
        });
    });
});
//# sourceMappingURL=handler.test.js.map
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
    const query = vi.fn(async () => ({ Items: [] }));

    const handler = createExecuteStepHandler({
      dynamoClient: { put, query, update },
      s3Client: { putObject },
      mainTableName: 'courseforge-main',
      artifactBucketName: 'artifacts',
    });

    const result = await handler(baseInput);
    const updateCall = (update as any).mock.calls[0][0];

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
      dynamoClient: { put: vi.fn(async () => ({})), query: vi.fn(async () => ({ Items: [] })), update },
      s3Client: { putObject },
      mainTableName: 'courseforge-main',
      artifactBucketName: 'artifacts',
      connectors: new Map([
        ['echo', { run: async () => largeOutput }],
      ]),
    });

    await handler(baseInput);
    const updateCall = (update as any).mock.calls[0][0];

    expect(putObject).toHaveBeenCalledOnce();
    expect(updateCall.ExpressionAttributeValues[':outputRef']).toBe(
      'runs/run-1/steps/step-1/output.json',
    );
  });

  it('records step failure and rethrows the error', async () => {
    const update = vi.fn(async () => ({}));
    const handler = createExecuteStepHandler({
      dynamoClient: { put: vi.fn(async () => ({})), query: vi.fn(async () => ({ Items: [] })), update },
      s3Client: { putObject: vi.fn(async () => ({ })) },
      mainTableName: 'courseforge-main',
      artifactBucketName: 'artifacts',
      connectors: new Map([
        ['echo', { run: async () => { throw Object.assign(new Error('boom'), { code: 'ConnectorError' }); } }],
      ]),
    });

    await expect(handler(baseInput)).rejects.toThrow('boom');
    const updateCall = (update as any).mock.calls[0][0];
    expect(update).toHaveBeenCalledOnce();
    expect(updateCall.ExpressionAttributeValues[':error']).toMatchObject({
      message: 'boom',
      code: 'ConnectorError',
    });
  });

  it('rebuilds accumulated context from prior successful step outputs', async () => {
    const connectorRun = vi.fn(async () => ({ value: 'next' }));

    const handler = createExecuteStepHandler({
      dynamoClient: {
        put: vi.fn(async () => ({})),
        query: vi.fn(async () => ({
          Items: [
            {
              stepId: 'step-0',
              stepIndex: 0,
              status: 'SUCCESS',
              output: { fromPrevious: true },
            },
          ],
        })),
        update: vi.fn(async () => ({})),
      },
      s3Client: { putObject: vi.fn(async () => ({ })) },
      mainTableName: 'courseforge-main',
      artifactBucketName: 'artifacts',
      connectors: new Map([
        ['echo', { run: connectorRun }],
      ]),
    });

    const result = await handler({
      ...baseInput,
      step: {
        ...baseInput.step,
        stepId: 'step-1',
        stepIndex: 1,
      },
    });

    expect(connectorRun).toHaveBeenCalledWith(
      { value: 'hello' },
      expect.objectContaining({
        existing: true,
        'step-0': { fromPrevious: true },
        tenantId: 'tenant-1',
        traceId: 'trace-1',
      }),
    );
    expect(result.accumulatedContext).toMatchObject({
      existing: true,
      'step-0': { fromPrevious: true },
      'step-1': { value: 'next' },
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createRunInitializerHandler } from './handler.js';

const input = {
  tenantId: 'tenant-1',
  workflowId: 'wf-1',
  runId: 'run-1',
  traceId: 'trace-1',
  payload: { hello: 'world' },
};

describe('createRunInitializerHandler', () => {
  it('throws when the workflow record is missing', async () => {
    const handler = createRunInitializerHandler({
      dynamoClient: {
        get: vi.fn(async () => ({})),
        query: vi.fn(async () => ({ Items: [] })),
        update: vi.fn(async () => ({})),
      },
      mainTableName: 'courseforge-main',
    });

    await expect(handler(input)).rejects.toThrow('workflow not found');
  });

  it('throws when there is no published version', async () => {
    const handler = createRunInitializerHandler({
      dynamoClient: {
        get: vi.fn(async () => ({ Item: { workflowId: 'wf-1', status: 'DRAFT' } })),
        query: vi.fn(async () => ({ Items: [] })),
        update: vi.fn(async () => ({})),
      },
      mainTableName: 'courseforge-main',
    });

    await expect(handler(input)).rejects.toThrow('no published version');
  });

  it('returns steps and updates the run record to RUNNING', async () => {
    const update = vi.fn(async () => ({}));
    const get = vi
      .fn()
      .mockResolvedValueOnce({ Item: { workflowId: 'wf-1', status: 'PUBLISHED', currentVersionId: 'v1' } });
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        Items: [
          {
            versionId: 'v1',
            compiledPlan: JSON.stringify([
              {
                stepId: 'step-1',
                stepIndex: 0,
                connectorKey: 'echo',
                actionType: 'echo',
                params: { value: 1 },
                retryPolicy: { maxAttempts: 2, backoffRate: 2 },
              },
            ]),
          },
        ],
      })
      .mockResolvedValueOnce({ Items: [{ PK: 'TENANT#tenant-1', SK: 'RUN#ts#run-1' }] });

    const handler = createRunInitializerHandler({
      dynamoClient: {
        get,
        query,
        update,
      },
      mainTableName: 'courseforge-main',
      clock: () => new Date('2026-04-03T12:00:00.000Z'),
    });

    const result = await handler(input);
    const updateCall = (update as any).mock.calls[0][0];

    expect(result.steps).toHaveLength(1);
    expect(result.versionId).toBe('v1');
    expect(update).toHaveBeenCalledOnce();
    expect(updateCall.ExpressionAttributeValues[':status']).toBe('RUNNING');
    expect(updateCall.ExpressionAttributeValues[':startedAt']).toBe(
      '2026-04-03T12:00:00.000Z',
    );
  });
});

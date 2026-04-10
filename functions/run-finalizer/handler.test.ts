import { describe, expect, it, vi } from 'vitest';
import { createRunFinalizerHandler } from './handler';

const baseInput = {
  runId: 'run-1',
  tenantId: 'tenant-1',
  workflowId: 'wf-1',
  status: 'SUCCESS' as const,
};

describe('createRunFinalizerHandler', () => {
  it('writes a RUN_COMPLETED audit entry for successful runs', async () => {
    const put = vi.fn(async () => ({}));
    const putEvents = vi.fn(async () => ({}));
    const handler = createRunFinalizerHandler({
      dynamoClient: {
        query: vi.fn(async () => ({ Items: [{ PK: 'TENANT#tenant-1', SK: 'RUN#ts#run-1', startedAt: '2026-04-03T12:00:00.000Z' }] })),
        update: vi.fn(async () => ({})),
        put,
      },
      eventBridgeClient: { putEvents },
      mainTableName: 'courseforge-main',
      eventBusName: 'courseforge-domain',
      clock: () => new Date('2026-04-03T12:00:05.000Z'),
    });

    const result = await handler(baseInput);
    const putCall = (put as any).mock.calls[0][0];
    const putEventsCall = (putEvents as any).mock.calls[0][0];

    expect(result.status).toBe('SUCCESS');
    expect(putCall.Item.actionType).toBe('RUN_COMPLETED');
    expect(putEventsCall.Entries[0].DetailType).toBe('RunCompleted');
  });

  it('stores failure details and publishes RunFailed', async () => {
    const update = vi.fn(async () => ({}));
    const putEvents = vi.fn(async () => ({}));
    const handler = createRunFinalizerHandler({
      dynamoClient: {
        query: vi.fn(async () => ({ Items: [{ PK: 'TENANT#tenant-1', SK: 'RUN#ts#run-1', startedAt: '2026-04-03T12:00:00.000Z' }] })),
        update,
        put: vi.fn(async () => ({})),
      },
      eventBridgeClient: { putEvents },
      mainTableName: 'courseforge-main',
      eventBusName: 'courseforge-domain',
      clock: () => new Date('2026-04-03T12:00:05.000Z'),
    });

    await handler({
      ...baseInput,
      status: 'FAILED',
      error: {
        failedStepId: 'step-1',
        errorMessage: 'boom',
        errorCode: 'ConnectorError',
      },
    });
    const updateCall = (update as any).mock.calls[0][0];
    const putEventsCall = (putEvents as any).mock.calls[0][0];

    expect(updateCall.ExpressionAttributeValues[':failedStepId']).toBe('step-1');
    expect(updateCall.ExpressionAttributeValues[':errorMessage']).toBe('boom');
    expect(putEventsCall.Entries[0].DetailType).toBe('RunFailed');
  });
});

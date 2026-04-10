import { describe, expect, it, vi } from 'vitest';
import { createReplayHandler } from './handler';

describe('createReplayHandler', () => {
  it('returns 422 for non-failed runs', async () => {
    const handler = createReplayHandler({
      dynamoClient: {
        query: vi.fn(async () => ({ Items: [{ runId: 'run-1', workflowId: 'wf-1', status: 'SUCCESS' }] })),
        put: vi.fn(async () => ({})),
      },
      eventBridgeClient: { putEvents: vi.fn(async () => ({})) },
      mainTableName: 'courseforge-main',
      eventBusName: 'courseforge-domain',
    });

    const result = await handler({ pathParameters: { runId: 'run-1' }, requestContext: { authorizer: { tenantId: 'tenant-1' } } });
    expect(result.statusCode).toBe(422);
  });

  it('creates a replay run and publishes RunReplayed', async () => {
    const put = vi.fn(async () => ({}));
    const putEvents = vi.fn(async () => ({}));
    const handler = createReplayHandler({
      dynamoClient: {
        query: vi.fn(async () => ({ Items: [{ runId: 'run-1', workflowId: 'wf-1', status: 'FAILED', payload: { a: 1 } }] })),
        put,
      },
      eventBridgeClient: { putEvents },
      mainTableName: 'courseforge-main',
      eventBusName: 'courseforge-domain',
      clock: () => new Date('2026-04-03T12:00:00.000Z'),
      uuid: () => 'run-2',
    });

    const result = await handler({ pathParameters: { runId: 'run-1' }, requestContext: { authorizer: { tenantId: 'tenant-1' } } });
    const putCall = (put as any).mock.calls[0][0];
    const putEventsCall = (putEvents as any).mock.calls[0][0];

    expect(result.statusCode).toBe(200);
    expect(put).toHaveBeenCalledOnce();
    expect(putCall.Item.parentRunId).toBe('run-1');
    expect(putEvents).toHaveBeenCalledOnce();
    expect(putEventsCall.Entries[0].DetailType).toBe('RunReplayed');
  });
});

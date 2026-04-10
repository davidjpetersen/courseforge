import { describe, expect, it, vi } from 'vitest';
import { WorkflowStatus } from '../../packages/types/src/index';
import { createScheduledTriggerHandler } from './handler';

describe('createScheduledTriggerHandler', () => {
  it('publishes events, writes a run, and updates the schedule for published workflows', async () => {
    const putEvents = vi.fn(async () => ({}));
    const put = vi.fn(async () => ({}));
    const update = vi.fn(async () => ({}));

    const handler = createScheduledTriggerHandler({
      dynamoClient: {
        async get() {
          return {
            Item: {
              tenantId: 'tenant-1',
              status: WorkflowStatus.PUBLISHED,
            },
          };
        },
        put,
        update,
      },
      eventBridgeClient: { putEvents },
      mainTableName: 'courseforge-main',
      schedulesTableName: 'courseforge-schedules',
      eventBusName: 'courseforge-domain',
      clock: () => new Date('2026-04-03T12:00:00.000Z'),
      uuid: (() => {
        const values = ['trace-1', 'run-1'];
        return () => values.shift() ?? 'extra-id';
      })(),
    });

    await handler({ workflowId: 'wf-1', tenantId: 'tenant-1', scheduleId: 'sched-1' });

    expect(putEvents).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });

  it('returns without error and does not emit anything for non-published workflows', async () => {
    const putEvents = vi.fn(async () => ({}));
    const put = vi.fn(async () => ({}));
    const update = vi.fn(async () => ({}));
    const warn = vi.fn();

    const handler = createScheduledTriggerHandler({
      dynamoClient: {
        async get() {
          return {
            Item: {
              tenantId: 'tenant-1',
              status: 'DRAFT',
            },
          };
        },
        put,
        update,
      },
      eventBridgeClient: { putEvents },
      mainTableName: 'courseforge-main',
      schedulesTableName: 'courseforge-schedules',
      eventBusName: 'courseforge-domain',
      logger: { warn },
    });

    await expect(
      handler({ workflowId: 'wf-1', tenantId: 'tenant-1', scheduleId: 'sched-1' }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(putEvents).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

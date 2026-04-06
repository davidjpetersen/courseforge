import { BatchWriteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';

import { createNotificationHandler } from './handler.js';

describe('createNotificationHandler', () => {
  it('writes one notification per subscribed user using batch write', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Items: [
          { userId: 'user-1', notificationPrefs: { workflowId: 'wf-1' } },
          { userId: 'user-2', notificationPrefs: { workflowId: 'all' } },
        ],
      })
      .mockResolvedValueOnce({});

    const handler = createNotificationHandler({
      dynamoClient: { send },
      mainTableName: 'courseforge-main',
      clock: () => new Date('2026-04-06T22:00:00.000Z'),
      uuid: (() => {
        let index = 0;
        return () => `notif-${++index}`;
      })(),
    });

    await handler({
      detail: {
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        runId: 'run-1',
        workflowName: 'Workflow One',
        failedStepName: 'Step A',
      },
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toBeInstanceOf(QueryCommand);
    expect(send.mock.calls[1][0]).toBeInstanceOf(BatchWriteCommand);

    const batchCommand = send.mock.calls[1][0] as BatchWriteCommand;
    const requestItems = batchCommand.input.RequestItems?.['courseforge-main'];
    expect(requestItems).toHaveLength(2);
    expect(requestItems?.[0]?.PutRequest?.Item).toMatchObject({
      PK: 'USER#user-1',
      type: 'RUN_FAILED',
      workflowId: 'wf-1',
      runId: 'run-1',
      workflowName: 'Workflow One',
      failedStepName: 'Step A',
      read: false,
      createdAt: '2026-04-06T22:00:00.000Z',
    });
  });

  it('skips users without matching notification preferences', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Items: [
          { userId: 'user-1' },
          { userId: 'user-2', notificationPrefs: { workflowId: 'wf-2' } },
        ],
      });

    const handler = createNotificationHandler({
      dynamoClient: { send },
      mainTableName: 'courseforge-main',
    });

    await handler({
      detail: {
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        runId: 'run-1',
      },
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBeInstanceOf(QueryCommand);
  });

  it('splits notifications into DynamoDB-sized batches', async () => {
    const users = Array.from({ length: 26 }, (_, index) => ({
      userId: `user-${index + 1}`,
      notificationPrefs: { workflowId: 'all' },
    }));

    const send = vi
      .fn()
      .mockResolvedValueOnce({ Items: users })
      .mockResolvedValue({});

    const handler = createNotificationHandler({
      dynamoClient: { send },
      mainTableName: 'courseforge-main',
      uuid: (() => {
        let index = 0;
        return () => `notif-${++index}`;
      })(),
    });

    await handler({
      detail: {
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        runId: 'run-1',
      },
    });

    expect(send).toHaveBeenCalledTimes(3);
    const firstBatch = send.mock.calls[1][0] as BatchWriteCommand;
    const secondBatch = send.mock.calls[2][0] as BatchWriteCommand;
    expect(firstBatch.input.RequestItems?.['courseforge-main']).toHaveLength(25);
    expect(secondBatch.input.RequestItems?.['courseforge-main']).toHaveLength(1);
  });
});

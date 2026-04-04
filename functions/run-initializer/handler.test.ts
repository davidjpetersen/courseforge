import { describe, expect, it } from 'vitest';

import { createRunInitializerHandler } from './handler.js';

class DynamoLocalMock {
  private readonly items = new Map<string, Record<string, unknown>>();

  put(item: Record<string, unknown>): void {
    this.items.set(`${item.PK as string}|${item.SK as string}`, item);
  }

  get(pk: string, sk: string): Record<string, unknown> | undefined {
    return this.items.get(`${pk}|${sk}`);
  }

  async send(command: { input: Record<string, unknown> }): Promise<{ Item?: Record<string, unknown> }> {
    const input = command.input;

    if ('Key' in input && !('UpdateExpression' in input)) {
      const key = input.Key as { PK: string; SK: string };
      return { Item: this.get(key.PK, key.SK) };
    }

    if ('Key' in input && 'UpdateExpression' in input) {
      const key = input.Key as { PK: string; SK: string };
      const existing = this.get(key.PK, key.SK) ?? { PK: key.PK, SK: key.SK };
      const values = input.ExpressionAttributeValues as Record<string, unknown>;
      this.put({
        ...existing,
        status: values[':status'],
        versionId: values[':versionId'],
        startedAt: values[':startedAt'],
      });
      return {};
    }

    return {};
  }
}

describe('createRunInitializerHandler', () => {
  it('throws when the workflow does not exist', async () => {
    const dynamo = new DynamoLocalMock();
    const handler = createRunInitializerHandler({
      dynamoClient: { send: dynamo.send.bind(dynamo) },
      mainTableName: 'courseforge-main',
    });

    await expect(
      handler({
        tenantId: 'tenant-1',
        workflowId: 'wf-missing',
        runId: 'run-1',
        traceId: 'trace-1',
        payload: {},
      }),
    ).rejects.toThrow('Workflow wf-missing was not found');
  });

  it('throws when the workflow has no publishedVersionId', async () => {
    const dynamo = new DynamoLocalMock();
    dynamo.put({ PK: 'WF#wf-1', SK: 'META' });

    const handler = createRunInitializerHandler({
      dynamoClient: { send: dynamo.send.bind(dynamo) },
      mainTableName: 'courseforge-main',
    });

    await expect(
      handler({
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        runId: 'run-1',
        traceId: 'trace-1',
        payload: {},
      }),
    ).rejects.toThrow('Workflow wf-1 has no published version');
  });

  it('returns steps and marks run as RUNNING when initialization succeeds', async () => {
    const dynamo = new DynamoLocalMock();
    const steps = [
      {
        stepId: 'step-1',
        stepIndex: 0,
        connectorKey: 'http',
        actionType: 'call',
        params: { method: 'GET', url: 'https://example.com' },
      },
    ];

    dynamo.put({ PK: 'WF#wf-1', SK: 'META', publishedVersionId: 'v1' });
    dynamo.put({ PK: 'WORKFLOW#wf-1', SK: 'VERSION#v1', compiledPlan: steps });
    dynamo.put({ PK: 'RUN#run-1', SK: 'META', status: 'PENDING' });

    const handler = createRunInitializerHandler({
      dynamoClient: { send: dynamo.send.bind(dynamo) },
      mainTableName: 'courseforge-main',
      clock: () => new Date('2026-04-04T00:00:00.000Z'),
    });

    const result = await handler({
      tenantId: 'tenant-1',
      workflowId: 'wf-1',
      runId: 'run-1',
      traceId: 'trace-1',
      payload: { hello: 'world' },
    });

    expect(result.steps).toEqual(steps);
    expect(result.runId).toBe('run-1');

    const updatedRun = dynamo.get('RUN#run-1', 'META');
    expect(updatedRun?.status).toBe('RUNNING');
    expect(updatedRun?.versionId).toBe('v1');
  });
});

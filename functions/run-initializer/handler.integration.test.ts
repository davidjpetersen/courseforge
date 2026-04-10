import { describe, expect, it } from 'vitest';

import { createRunInitializerHandler } from './handler';

type Item = Record<string, unknown>;

function keyOf(pk: unknown, sk: unknown): string {
  return `${String(pk)}||${String(sk)}`;
}

class DynamoLocalMock {
  private readonly items = new Map<string, Item>();

  seed(item: Item) {
    this.items.set(keyOf(item.PK, item.SK), { ...item });
  }

  async get(params: { TableName: string; Key: Record<string, unknown> }) {
    return {
      Item: this.items.get(keyOf(params.Key.PK, params.Key.SK)),
    };
  }

  async query(params: {
    TableName: string;
    KeyConditionExpression: string;
    ExpressionAttributeValues: Record<string, unknown>;
    FilterExpression?: string;
    Limit?: number;
  }) {
    const pk = params.ExpressionAttributeValues[':pk'];
    const skPrefix = params.ExpressionAttributeValues[':skPrefix'];
    const runId = params.ExpressionAttributeValues[':runId'];

    let results = [...this.items.values()].filter((item) => item.PK === pk);

    if (typeof skPrefix === 'string') {
      results = results.filter(
        (item) => typeof item.SK === 'string' && item.SK.startsWith(skPrefix),
      );
    }

    if (runId !== undefined) {
      results = results.filter((item) => item.runId === runId);
    }

    if (typeof params.Limit === 'number') {
      results = results.slice(0, params.Limit);
    }

    return { Items: results };
  }

  async update(params: {
    TableName: string;
    Key: Record<string, unknown>;
    UpdateExpression: string;
    ExpressionAttributeValues: Record<string, unknown>;
    ExpressionAttributeNames?: Record<string, string>;
  }) {
    const key = keyOf(params.Key.PK, params.Key.SK);
    const existing = this.items.get(key);
    if (!existing) {
      throw new Error(`Missing item for update: ${key}`);
    }

    const updated = { ...existing };
    const expression = params.UpdateExpression.replace(/^SET\s+/, '');
    for (const assignment of expression.split(',').map((part) => part.trim())) {
      const [rawField, rawValue] = assignment.split('=').map((part) => part.trim());
      const field = params.ExpressionAttributeNames?.[rawField] ?? rawField;
      updated[field] = params.ExpressionAttributeValues[rawValue];
    }

    this.items.set(key, updated);
    return {};
  }
}

describe('RunInitializer integration', () => {
  const input = {
    tenantId: 'tenant-1',
    workflowId: 'wf-1',
    runId: 'run-1',
    traceId: 'trace-1',
    payload: { hello: 'world' },
  };

  it('returns workflow not found when the workflow record is missing', async () => {
    const dynamo = new DynamoLocalMock();
    dynamo.seed({
      PK: 'TENANT#tenant-1',
      SK: 'RUN#2026-04-06T22:30:00.000Z#run-1',
      runId: 'run-1',
      tenantId: 'tenant-1',
      status: 'PENDING',
    });

    const handler = createRunInitializerHandler({
      dynamoClient: dynamo,
      mainTableName: 'courseforge-main',
    });

    await expect(handler(input)).rejects.toThrow('workflow not found');
  });

  it('returns no published version when the workflow is not published', async () => {
    const dynamo = new DynamoLocalMock();
    dynamo.seed({
      PK: 'TENANT#tenant-1',
      SK: 'WORKFLOW#wf-1',
      workflowId: 'wf-1',
      tenantId: 'tenant-1',
      status: 'DRAFT',
    });
    dynamo.seed({
      PK: 'TENANT#tenant-1',
      SK: 'RUN#2026-04-06T22:30:00.000Z#run-1',
      runId: 'run-1',
      tenantId: 'tenant-1',
      status: 'PENDING',
    });

    const handler = createRunInitializerHandler({
      dynamoClient: dynamo,
      mainTableName: 'courseforge-main',
    });

    await expect(handler(input)).rejects.toThrow('no published version');
  });

  it('returns step definitions and updates the run record to RUNNING', async () => {
    const dynamo = new DynamoLocalMock();
    dynamo.seed({
      PK: 'TENANT#tenant-1',
      SK: 'WORKFLOW#wf-1',
      workflowId: 'wf-1',
      tenantId: 'tenant-1',
      status: 'PUBLISHED',
      currentVersionId: 'version-1',
    });
    dynamo.seed({
      PK: 'WORKFLOW#wf-1',
      SK: 'VERSION#0.1.0',
      versionId: 'version-1',
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
    });
    dynamo.seed({
      PK: 'TENANT#tenant-1',
      SK: 'RUN#2026-04-06T22:30:00.000Z#run-1',
      runId: 'run-1',
      tenantId: 'tenant-1',
      workflowId: 'wf-1',
      status: 'PENDING',
    });

    const handler = createRunInitializerHandler({
      dynamoClient: dynamo,
      mainTableName: 'courseforge-main',
      clock: () => new Date('2026-04-06T22:31:00.000Z'),
    });

    const result = await handler(input);
    const updatedRun = await dynamo.get({
      TableName: 'courseforge-main',
      Key: {
        PK: 'TENANT#tenant-1',
        SK: 'RUN#2026-04-06T22:30:00.000Z#run-1',
      },
    });

    expect(result.steps).toEqual([
      {
        stepId: 'step-1',
        stepIndex: 0,
        connectorKey: 'echo',
        actionType: 'echo',
        params: { value: 1 },
        retryPolicy: { maxAttempts: 2, backoffRate: 2 },
      },
    ]);
    expect(updatedRun.Item).toMatchObject({
      status: 'RUNNING',
      versionId: 'version-1',
      startedAt: '2026-04-06T22:31:00.000Z',
    });
  });
});

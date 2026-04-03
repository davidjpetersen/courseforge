import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import { webhookSecretSK, workflowMetaSK, workflowPK } from '../../src/models/schema.js';
import { WorkflowStatus } from '../../packages/types/src/index.js';
import { createWebhookIngressHandler } from './handler.js';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('createWebhookIngressHandler', () => {
  it('returns 202 with runId and traceId for a valid authenticated request', async () => {
    const gets: Array<Record<string, unknown>> = [];
    const puts: Array<Record<string, unknown>> = [];
    const events: Array<Record<string, unknown>> = [];

    const handler = createWebhookIngressHandler({
      dynamoClient: {
        async get(params) {
          gets.push(params);
          if ((params.Key.SK as string) === webhookSecretSK('wf-1')) {
            return { Item: { tokenHash: sha256('secret-token') } };
          }

          return {
            Item: {
              PK: workflowPK('wf-1'),
              SK: workflowMetaSK(),
              tenantId: 'tenant-1',
              status: WorkflowStatus.PUBLISHED,
            },
          };
        },
        async put(params) {
          puts.push(params);
          return {};
        },
      },
      eventBridgeClient: {
        async putEvents(params) {
          events.push(params);
          return {};
        },
      },
      mainTableName: 'courseforge-main',
      eventBusName: 'courseforge-domain',
      clock: () => new Date('2026-04-03T12:00:00.000Z'),
      uuid: (() => {
        const values = ['trace-1', 'run-1'];
        return () => values.shift() ?? 'extra-id';
      })(),
    });

    const response = await handler({
      pathParameters: { workflowId: 'wf-1' },
      headers: { Authorization: 'Bearer tenant-1:secret-token' },
      body: JSON.stringify({ hello: 'world' }),
    });

    expect(response.statusCode).toBe(202);
    expect(JSON.parse(response.body)).toEqual({ runId: 'run-1', traceId: 'trace-1' });
    expect(gets).toHaveLength(2);
    expect(puts).toHaveLength(1);
    expect(events).toHaveLength(1);
  });

  it('returns 401 for invalid bearer token', async () => {
    const handler = createWebhookIngressHandler({
      dynamoClient: {
        async get() {
          return { Item: { tokenHash: sha256('different-token') } };
        },
        async put() {
          return {};
        },
      },
      eventBridgeClient: {
        async putEvents() {
          return {};
        },
      },
      mainTableName: 'courseforge-main',
      eventBusName: 'courseforge-domain',
    });

    const response = await handler({
      pathParameters: { workflowId: 'wf-1' },
      headers: { Authorization: 'Bearer tenant-1:secret-token' },
      body: JSON.stringify({ hello: 'world' }),
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 409 for a non-published workflow', async () => {
    let getCount = 0;
    const handler = createWebhookIngressHandler({
      dynamoClient: {
        async get() {
          getCount += 1;
          if (getCount === 1) {
            return { Item: { tokenHash: sha256('secret-token') } };
          }
          return { Item: { tenantId: 'tenant-1', status: 'DRAFT' } };
        },
        async put() {
          return {};
        },
      },
      eventBridgeClient: {
        async putEvents() {
          return {};
        },
      },
      mainTableName: 'courseforge-main',
      eventBusName: 'courseforge-domain',
    });

    const response = await handler({
      pathParameters: { workflowId: 'wf-1' },
      headers: { Authorization: 'Bearer tenant-1:secret-token' },
      body: JSON.stringify({ hello: 'world' }),
    });

    expect(response.statusCode).toBe(409);
  });

  it('returns 400 for invalid JSON bodies', async () => {
    let getCount = 0;
    const handler = createWebhookIngressHandler({
      dynamoClient: {
        async get() {
          getCount += 1;
          if (getCount === 1) {
            return { Item: { tokenHash: sha256('secret-token') } };
          }
          return {
            Item: {
              tenantId: 'tenant-1',
              status: WorkflowStatus.PUBLISHED,
            },
          };
        },
        async put() {
          return {};
        },
      },
      eventBridgeClient: {
        async putEvents() {
          return {};
        },
      },
      mainTableName: 'courseforge-main',
      eventBusName: 'courseforge-domain',
    });

    const response = await handler({
      pathParameters: { workflowId: 'wf-1' },
      headers: { Authorization: 'Bearer tenant-1:secret-token' },
      body: '{bad-json',
    });

    expect(response.statusCode).toBe(400);
  });
});

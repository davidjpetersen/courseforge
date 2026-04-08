import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

import { createV1EventHandler, type EventHandlerDeps } from '../../../../src/api/v1/events.js';
import { tenantPK } from '../../../../src/models/schema.js';
import { runV1Middleware, client, tableName } from '../_middleware.js';

const eventBridgeClient = new EventBridgeClient({});
const eventBusName = process.env.EVENT_BUS_NAME ?? 'default';

const deps: EventHandlerDeps = {
  workflowRepo: {
    async getById(tenantId: string, workflowId: string) {
      const result = await client.send(new GetCommand({
        TableName: tableName,
        Key: { PK: tenantPK(tenantId), SK: `WORKFLOW#${workflowId}` },
      }));
      if (!result.Item) return null;
      return {
        workflowId: String(result.Item.workflowId),
        tenantId: String(result.Item.tenantId),
        status: String(result.Item.status),
      };
    },
  },
  eventPublisher: {
    async publish(event) {
      await eventBridgeClient.send(new PutEventsCommand({
        Entries: [{
          Source: 'courseforge.trigger',
          DetailType: event.eventType,
          Detail: JSON.stringify({
            tenantId: event.tenantId,
            workflowId: event.workflowId,
            payload: event.payload,
            traceId: event.traceId,
            timestamp: event.timestamp,
          }),
          EventBusName: eventBusName,
        }],
      }));
    },
  },
  runRepo: {
    async create(run) {
      await client.send(new PutCommand({
        TableName: tableName,
        Item: {
          PK: tenantPK(run.tenantId),
          SK: `RUN#${run.startedAt}#${run.runId}`,
          ...run,
        },
      }));
    },
  },
};

const handler = createV1EventHandler(deps);

export async function POST(request: NextRequest) {
  const mw = await runV1Middleware(request, 'POST', '/api/v1/events');
  if (mw.error) return mw.error;

  const body = await request.json();
  const result = await handler.trigger(mw.auth.tenantId, body);
  return new NextResponse(result.body, { status: result.statusCode, headers: result.headers });
}

import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

import { createReplayHandler } from '../../../../../src/api/replay/handler.js';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const eventBridgeClient = new EventBridgeClient({});
const runsTable = process.env.MAIN_TABLE_NAME ?? process.env.RUNS_TABLE_NAME ?? 'CourseForgeRuns';
const eventBusName = process.env.EVENT_BUS_NAME ?? 'default';

const handler = createReplayHandler({
  dynamoClient: {
    async query(params) {
      const result = await ddb.send(new QueryCommand(params));
      return { Items: result.Items as Array<Record<string, unknown>> | undefined };
    },
    async put(params) {
      await ddb.send(new PutCommand(params));
      return {};
    },
  },
  eventBridgeClient: {
    async putEvents(params) {
      await eventBridgeClient.send(new PutEventsCommand(params));
      return {};
    },
  },
  mainTableName: runsTable,
  eventBusName,
});

export async function POST(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const result = await handler({
    pathParameters: { runId },
    requestContext: {
      authorizer: {
        tenantId: request.headers.get('x-tenant-id') ?? 'CURRENT',
      },
    },
  });
  return new NextResponse(result.body, { status: result.statusCode, headers: result.headers });
}

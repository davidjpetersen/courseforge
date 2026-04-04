import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

import { createReplayRunHandler } from '../../../../../src/api/runs/replay';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const eventBridgeClient = new EventBridgeClient({});
const runsTable = process.env.RUNS_TABLE_NAME ?? 'CourseForgeRuns';
const eventBusName = process.env.EVENT_BUS_NAME ?? 'default';

const handler = createReplayRunHandler({
  async getRun(runId) {
    const res = await ddb.send(new GetCommand({ TableName: runsTable, Key: { PK: `RUN#${runId}`, SK: 'META' } }));
    return res.Item as Record<string, unknown> | undefined;
  },
  async createRun(item) {
    await ddb.send(new PutCommand({ TableName: runsTable, Item: item }));
  },
  eventBridgeClient: {
    async putEvents(params) {
      await eventBridgeClient.send(new PutEventsCommand(params));
      return {};
    },
  },
  eventBusName,
});

export async function POST(_: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const result = await handler({ pathParameters: { runId } });
  return new NextResponse(result.body, { status: result.statusCode, headers: result.headers });
}

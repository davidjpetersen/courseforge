import { randomUUID } from 'node:crypto';

import { RunStatus } from '../../../packages/types/src/index';
import { runRecordPK, runRecordSK } from '../../../functions/shared/keys';
import { findRunRecordById } from '../../../functions/shared/run-records';
import type { ReplayResponse } from '../../../functions/shared/types';

export interface APIGatewayProxyEvent {
  pathParameters?: Record<string, string> | null;
  requestContext?: { authorizer?: { tenantId?: string } };
}

export interface APIGatewayProxyResult {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

export interface DynamoClientLike {
  query: Parameters<typeof findRunRecordById>[0]['query'];
  put(params: { TableName: string; Item: Record<string, unknown> }): Promise<unknown>;
}

export interface EventBridgeClientLike {
  putEvents(params: {
    Entries: Array<{
      EventBusName: string;
      Source: string;
      DetailType: string;
      Detail: string;
    }>;
  }): Promise<unknown>;
}

export interface ReplayHandlerDeps {
  dynamoClient: DynamoClientLike;
  eventBridgeClient: EventBridgeClientLike;
  mainTableName: string;
  eventBusName: string;
  clock?: () => Date;
  uuid?: () => string;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

export function createReplayHandler(deps: ReplayHandlerDeps) {
  const now = deps.clock ?? (() => new Date());
  const makeUuid = deps.uuid ?? randomUUID;

  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const runId = event.pathParameters?.runId;
    const tenantId = event.requestContext?.authorizer?.tenantId;

    if (!runId || !tenantId) {
      return jsonResponse(400, { message: 'runId and tenantId are required' });
    }

    const runRecord = await findRunRecordById(deps.dynamoClient, deps.mainTableName, tenantId, runId);
    if (!runRecord) {
      return jsonResponse(404, { message: 'Run not found' });
    }

    if (runRecord.status !== RunStatus.FAILED && runRecord.status !== 'FAILED') {
      return jsonResponse(422, { message: 'Only failed runs can be replayed' });
    }

    const timestamp = now().toISOString();
    const newRunId = makeUuid();
    const response: ReplayResponse = { newRunId, parentRunId: runId };

    await deps.dynamoClient.put({
      TableName: deps.mainTableName,
      Item: {
        PK: runRecordPK(tenantId),
        SK: runRecordSK(timestamp, newRunId),
        tenantId,
        workflowId: runRecord.workflowId,
        runId: newRunId,
        parentRunId: runId,
        status: RunStatus.PENDING,
        triggerType: 'replay',
        payload: runRecord.payload ?? {},
        createdAt: timestamp,
      },
    });

    await deps.eventBridgeClient.putEvents({
      Entries: [
        {
          EventBusName: deps.eventBusName,
          Source: 'courseforge.trigger',
          DetailType: 'RunReplayed',
          Detail: JSON.stringify({
            tenantId,
            workflowId: runRecord.workflowId,
            runId: newRunId,
            parentRunId: runId,
            payload: runRecord.payload ?? {},
          }),
        },
      ],
    });

    return jsonResponse(200, response);
  };
}

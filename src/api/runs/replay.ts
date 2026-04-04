import { randomUUID } from 'node:crypto';

export interface ReplayRequest {
  pathParameters?: Record<string, string> | null;
}

export interface ReplayResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

export interface ReplayDeps {
  getRun(runId: string): Promise<Record<string, unknown> | undefined>;
  createRun(item: Record<string, unknown>): Promise<void>;
  eventBridgeClient: {
    putEvents(params: {
      Entries: Array<{
        EventBusName: string;
        Source: string;
        DetailType: string;
        Detail: string;
      }>;
    }): Promise<unknown>;
  };
  eventBusName: string;
  clock?: () => Date;
  uuid?: () => string;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(statusCode: number, body: unknown): ReplayResponse {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

export function createReplayRunHandler(deps: ReplayDeps) {
  const now = deps.clock ?? (() => new Date());
  const makeUuid = deps.uuid ?? randomUUID;

  return async (request: ReplayRequest): Promise<ReplayResponse> => {
    const runId = request.pathParameters?.runId;
    if (!runId) {
      return jsonResponse(400, { message: 'runId path parameter is required' });
    }

    const run = await deps.getRun(runId);
    if (!run) {
      return jsonResponse(404, { message: 'Run not found' });
    }

    if (run.status !== 'FAILED') {
      return jsonResponse(422, { message: 'Only FAILED runs can be replayed' });
    }

    const newRunId = makeUuid();
    const createdAt = now().toISOString();

    await deps.createRun({
      PK: `RUN#${newRunId}`,
      SK: 'META',
      runId: newRunId,
      tenantId: run.tenantId,
      workflowId: run.workflowId,
      status: 'PENDING',
      triggerType: 'replay',
      parentRunId: runId,
      payload: run.payload,
      createdAt,
    });

    await deps.eventBridgeClient.putEvents({
      Entries: [
        {
          EventBusName: deps.eventBusName,
          Source: 'courseforge.trigger',
          DetailType: 'RunReplayed',
          Detail: JSON.stringify({
            tenantId: run.tenantId,
            workflowId: run.workflowId,
            runId: newRunId,
            parentRunId: runId,
            payload: run.payload,
          }),
        },
      ],
    });

    return jsonResponse(200, { newRunId, parentRunId: runId });
  };
}

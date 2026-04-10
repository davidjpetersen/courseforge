import { createHash, randomUUID } from 'node:crypto';

import {
  runSK,
  tenantPK,
  webhookSecretSK,
  workflowMetaSK,
  workflowPK,
} from '../../src/models/schema';
import {
  RunStatus,
  TRIGGER_EVENT_TYPES,
  WorkflowStatus,
  type DomainEvent,
} from '../../packages/types/src/index';

export interface APIGatewayProxyEvent {
  pathParameters?: Record<string, string> | null;
  headers?: Record<string, string> | null;
  body?: string | null;
}

export interface APIGatewayProxyResult {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

export interface DynamoClientLike {
  get(params: {
    TableName: string;
    Key: Record<string, unknown>;
  }): Promise<{ Item?: Record<string, unknown> }>;
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

export interface WebhookIngressDeps {
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

function getHeader(
  headers: Record<string, string> | null | undefined,
  name: string,
): string | undefined {
  if (!headers) {
    return undefined;
  }

  const match = Object.entries(headers).find(
    ([headerName]) => headerName.toLowerCase() === name.toLowerCase(),
  );
  return match?.[1];
}

export function parseAuthorizationHeader(
  authorizationHeader: string | undefined,
): { tenantId: string; token: string } | null {
  if (!authorizationHeader) {
    return null;
  }

  const bearerMatch = authorizationHeader.match(/^Bearer\s+([^:]+):(.+)$/i);
  if (!bearerMatch) {
    return null;
  }

  const [, tenantId, token] = bearerMatch;
  if (!tenantId || !token) {
    return null;
  }

  return { tenantId, token };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createWebhookIngressHandler(deps: WebhookIngressDeps) {
  const now = deps.clock ?? (() => new Date());
  const makeUuid = deps.uuid ?? randomUUID;

  return async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    const workflowId = event.pathParameters?.workflowId;
    if (!workflowId) {
      return jsonResponse(400, { message: 'workflowId path parameter is required' });
    }

    const auth = parseAuthorizationHeader(getHeader(event.headers, 'authorization'));
    if (!auth) {
      return jsonResponse(401, { message: 'Authorization header is required' });
    }

    const secret = await deps.dynamoClient.get({
      TableName: deps.mainTableName,
      Key: {
        PK: tenantPK(auth.tenantId),
        SK: webhookSecretSK(workflowId),
      },
    });

    if (!secret.Item || secret.Item.tokenHash !== sha256(auth.token)) {
      return jsonResponse(401, { message: 'Unauthorized' });
    }

    const workflow = await deps.dynamoClient.get({
      TableName: deps.mainTableName,
      Key: {
        PK: workflowPK(workflowId),
        SK: workflowMetaSK(),
      },
    });

    if (
      !workflow.Item ||
      workflow.Item.status !== WorkflowStatus.PUBLISHED ||
      workflow.Item.tenantId !== auth.tenantId
    ) {
      return jsonResponse(409, {
        message: 'Workflow is not in a triggerable state',
      });
    }

    if (!event.body) {
      return jsonResponse(400, { message: 'Request body is required' });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(event.body);
    } catch {
      return jsonResponse(400, { message: 'Invalid JSON in request body' });
    }

    const timestamp = now().toISOString();
    const traceId = makeUuid();
    const runId = makeUuid();
    const domainEvent: DomainEvent = {
      tenantId: auth.tenantId,
      workflowId,
      eventType: TRIGGER_EVENT_TYPES.WEBHOOK_RECEIVED,
      payload,
      traceId,
      timestamp,
    };

    await deps.eventBridgeClient.putEvents({
      Entries: [
        {
          EventBusName: deps.eventBusName,
          Source: 'courseforge.trigger',
          DetailType: TRIGGER_EVENT_TYPES.WEBHOOK_RECEIVED,
          Detail: JSON.stringify(domainEvent),
        },
      ],
    });

    await deps.dynamoClient.put({
      TableName: deps.mainTableName,
      Item: {
        PK: tenantPK(auth.tenantId),
        SK: runSK(timestamp, runId),
        tenantId: auth.tenantId,
        workflowId,
        runId,
        traceId,
        triggerType: 'webhook',
        status: RunStatus.PENDING,
        startedAt: timestamp,
        createdAt: timestamp,
      },
    });

    return jsonResponse(202, { runId, traceId });
  };
}

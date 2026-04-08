/**
 * V1 Event triggering handler.
 *
 * POST /api/v1/events — trigger a workflow run by publishing a DomainEvent.
 *
 * Validates the request body, checks workflow ownership and PUBLISHED status,
 * publishes a DomainEvent to EventBridge, creates a Run record, and returns
 * the runId + traceId.
 */

import { randomUUID } from 'node:crypto';

// ── Minimal API Gateway types (matching existing pattern) ──

export interface APIGatewayProxyResult {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

// ── Dependency interfaces ──

export interface DomainEventInput {
  tenantId: string;
  workflowId: string;
  eventType: string;
  payload: unknown;
  traceId: string;
  timestamp: string;
}

export interface RunInput {
  runId: string;
  tenantId: string;
  workflowId: string;
  traceId: string;
  triggerType: string;
  status: string;
  startedAt: string;
  createdAt: string;
}

export interface EventHandlerDeps {
  workflowRepo: {
    getById(tenantId: string, workflowId: string): Promise<{ workflowId: string; tenantId: string; status: string } | null>;
  };
  eventPublisher: {
    publish(event: DomainEventInput): Promise<void>;
  };
  runRepo: {
    create(run: RunInput): Promise<void>;
  };
}

// ── Helpers ──

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

// ── Input validation ──

export function validateEventBody(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return 'Request body must be a JSON object';
  }

  const record = body as Record<string, unknown>;

  if (typeof record.workflowId !== 'string' || record.workflowId.trim() === '') {
    return 'workflowId is required and must be a non-empty string';
  }

  if (typeof record.payload !== 'object' || record.payload === null || Array.isArray(record.payload)) {
    return 'payload is required and must be an object';
  }

  return null;
}

// ── Handler factory ──

export function createV1EventHandler(deps: EventHandlerDeps) {
  return {
    /**
     * POST /api/v1/events
     */
    async trigger(
      tenantId: string,
      body: unknown,
    ): Promise<APIGatewayProxyResult> {
      // 1. Validate request body
      const validationError = validateEventBody(body);
      if (validationError) {
        return jsonResponse(400, { error: validationError });
      }

      const { workflowId, payload } = body as { workflowId: string; payload: Record<string, unknown> };

      // 2. Check workflow ownership and PUBLISHED status
      const workflow = await deps.workflowRepo.getById(tenantId, workflowId);
      if (!workflow || workflow.status !== 'PUBLISHED') {
        return jsonResponse(409, { error: 'Workflow is not in a triggerable state' });
      }

      // 3. Generate IDs and timestamp
      const runId = randomUUID();
      const traceId = randomUUID();
      const timestamp = new Date().toISOString();

      // 4. Publish DomainEvent to EventBridge
      await deps.eventPublisher.publish({
        tenantId,
        workflowId,
        eventType: 'ApiEventReceived',
        payload,
        traceId,
        timestamp,
      });

      // 5. Create Run record
      await deps.runRepo.create({
        runId,
        tenantId,
        workflowId,
        traceId,
        triggerType: 'api',
        status: 'PENDING',
        startedAt: timestamp,
        createdAt: timestamp,
      });

      // 6. Return 202 with runId and traceId
      return jsonResponse(202, { runId, traceId });
    },
  };
}

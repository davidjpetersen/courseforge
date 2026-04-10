/**
 * Lambda handler for the Publish API.
 *
 * POST /workflows — validates request, triggers Step Functions publish pipeline,
 * and returns the created workflow details.
 */

import type { Workflow } from '../../models/types';

// ── Request / Response types ──

export interface PublishRequest {
  templateId: string;
  tenantId: string;
  name: string;
  configuration: Record<string, unknown>;
}

export interface PublishResponse {
  workflowId: string;
  status: 'active';
  name: string;
  firstRunUrl: string;
}

// ── Step Functions client interface (abstracted for testability) ──

export interface StepFunctionsClient {
  /**
   * Start the publish pipeline state machine.
   * Returns the created Workflow record on success.
   */
  startPublishPipeline(request: PublishRequest): Promise<Workflow>;
}

// ── Minimal API Gateway types ──

export interface APIGatewayProxyEvent {
  httpMethod: string;
  path: string;
  pathParameters?: Record<string, string> | null;
  queryStringParameters?: Record<string, string> | null;
  headers?: Record<string, string> | null;
  body?: string | null;
}

export interface APIGatewayProxyResult {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

// ── Response helpers ──

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(
  statusCode: number,
  body: unknown,
): APIGatewayProxyResult {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

// ── Request validation ──

export function validatePublishRequest(
  body: unknown,
): PublishRequest | string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return 'Request body must be a JSON object';
  }
  const obj = body as Record<string, unknown>;

  if (typeof obj.templateId !== 'string' || obj.templateId.trim() === '') {
    return 'templateId is required and must be a non-empty string';
  }
  if (typeof obj.tenantId !== 'string' || obj.tenantId.trim() === '') {
    return 'tenantId is required and must be a non-empty string';
  }
  if (typeof obj.name !== 'string' || obj.name.trim() === '') {
    return 'name is required and must be a non-empty string';
  }
  if (
    typeof obj.configuration !== 'object' ||
    obj.configuration === null ||
    Array.isArray(obj.configuration)
  ) {
    return 'configuration is required and must be an object';
  }

  return {
    templateId: obj.templateId,
    tenantId: obj.tenantId,
    name: obj.name,
    configuration: obj.configuration as Record<string, unknown>,
  };
}

// ── Build first-run monitoring URL ──

export function buildFirstRunUrl(workflowId: string, tenantId: string): string {
  return `/tenants/${tenantId}/workflows/${workflowId}/runs/latest`;
}

// ── Handler factory ──

export function createPublishHandler(sfnClient: StepFunctionsClient) {
  return async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Parse body
      if (!event.body) {
        return jsonResponse(400, { message: 'Request body is required' });
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(event.body);
      } catch {
        return jsonResponse(400, { message: 'Invalid JSON in request body' });
      }

      const validated = validatePublishRequest(parsed);
      if (typeof validated === 'string') {
        return jsonResponse(400, { message: validated });
      }

      // Trigger Step Functions publish pipeline
      const workflow = await sfnClient.startPublishPipeline(validated);

      const response: PublishResponse = {
        workflowId: workflow.workflowId,
        status: 'active',
        name: workflow.name,
        firstRunUrl: buildFirstRunUrl(workflow.workflowId, workflow.tenantId),
      };

      return jsonResponse(200, response);
    } catch (error) {
      console.error('Error publishing workflow:', error);
      const message =
        error instanceof Error ? error.message : 'Internal server error';
      return jsonResponse(500, { message });
    }
  };
}

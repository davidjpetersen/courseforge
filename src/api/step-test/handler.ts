/**
 * Lambda handler for the Step Test API.
 *
 * POST /steps/{stepId}/test — dry-run validation against connected system.
 */

import type { FieldValue } from '../../models/types';

// ── Request / Response types ──

export interface StepTestRequest {
  templateId: string;
  stepIndex: number;
  configuration: Record<string, FieldValue>;
}

export interface StepTestResponse {
  result: 'pass' | 'fail';
  details: string;
  suggestedFix: string | null;
}

// ── Connected system client interface (abstracted for testability) ──

export interface ConnectedSystemClient {
  /** Execute a dry-run validation of the step configuration. */
  dryRun(
    systemName: string,
    configuration: Record<string, FieldValue>,
  ): Promise<StepTestResponse>;
}

// ── Template lookup interface ──

export interface StepTestTemplateProvider {
  /** Return the connected system name for a given template step, or null. */
  getConnectedSystemForStep(
    templateId: string,
    stepIndex: number,
  ): Promise<string | null>;
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

export function validateStepTestRequest(
  body: unknown,
): StepTestRequest | string {
  if (typeof body !== 'object' || body === null) {
    return 'Request body must be a JSON object';
  }
  const obj = body as Record<string, unknown>;

  if (typeof obj.templateId !== 'string' || obj.templateId.trim() === '') {
    return 'templateId is required and must be a non-empty string';
  }
  if (typeof obj.stepIndex !== 'number' || !Number.isInteger(obj.stepIndex) || obj.stepIndex < 0) {
    return 'stepIndex is required and must be a non-negative integer';
  }
  if (typeof obj.configuration !== 'object' || obj.configuration === null || Array.isArray(obj.configuration)) {
    return 'configuration is required and must be an object';
  }

  return {
    templateId: obj.templateId,
    stepIndex: obj.stepIndex,
    configuration: obj.configuration as Record<string, FieldValue>,
  };
}

// ── Handler factory ──

export function createStepTestHandler(
  templateProvider: StepTestTemplateProvider,
  systemClient: ConnectedSystemClient,
) {
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

      const validated = validateStepTestRequest(parsed);
      if (typeof validated === 'string') {
        return jsonResponse(400, { message: validated });
      }

      // Look up connected system for the step
      const connectedSystem = await templateProvider.getConnectedSystemForStep(
        validated.templateId,
        validated.stepIndex,
      );

      if (!connectedSystem) {
        return jsonResponse(400, {
          message: 'Step does not reference a connected system and cannot be tested',
        });
      }

      // Execute dry-run
      const result = await systemClient.dryRun(
        connectedSystem,
        validated.configuration,
      );

      return jsonResponse(200, result);
    } catch (error) {
      console.error('Error testing step:', error);
      return jsonResponse(500, { message: 'Internal server error' });
    }
  };
}

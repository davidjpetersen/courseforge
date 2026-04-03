/**
 * Lambda handlers for the Template API.
 *
 * GET /templates           — list all templates, optional ?category= filter
 * GET /templates/{templateId} — get template detail with missing connections
 */

import type { Template } from '../../models/types.js';
import {
  buildListResponse,
  buildDetailResponse,
  type TemplateListResponse,
  type TemplateDetailResponse,
} from './logic.js';

// ── Minimal API Gateway types (avoids heavy @types/aws-lambda dep) ──

export interface APIGatewayProxyEvent {
  httpMethod: string;
  path: string;
  pathParameters?: Record<string, string> | null;
  queryStringParameters?: Record<string, string> | null;
  headers?: Record<string, string> | null;
}

export interface APIGatewayProxyResult {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

// ── Repository interface (abstracts DynamoDB) ──

export interface TemplateRepository {
  /** Return all templates. */
  listAll(): Promise<Template[]>;
  /** Return a single template by ID, or null if not found. */
  getById(templateId: string): Promise<Template | null>;
}

// ── Tenant connection provider ──

export interface TenantConnectionProvider {
  /** Return the set of connection names the tenant has configured. */
  getConfiguredConnections(tenantId: string): Promise<string[]>;
}

// ── Response helpers ──

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

// ── GET /templates ──

export function createListTemplatesHandler(repo: TemplateRepository) {
  return async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    try {
      const categoryParam =
        event.queryStringParameters?.category ?? '';
      const selectedCategories = categoryParam
        ? categoryParam.split(',').map((c) => c.trim()).filter(Boolean)
        : [];

      const allTemplates = await repo.listAll();
      const response: TemplateListResponse = buildListResponse(
        allTemplates,
        selectedCategories,
      );

      return jsonResponse(200, response);
    } catch (error) {
      console.error('Error listing templates:', error);
      return jsonResponse(500, { message: 'Internal server error' });
    }
  };
}

// ── GET /templates/{templateId} ──

export function createGetTemplateHandler(
  repo: TemplateRepository,
  connectionProvider: TenantConnectionProvider,
) {
  return async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    try {
      const templateId = event.pathParameters?.templateId;
      if (!templateId) {
        return jsonResponse(400, { message: 'Missing templateId path parameter' });
      }

      const template = await repo.getById(templateId);
      if (!template) {
        return jsonResponse(404, { message: 'Template not found' });
      }

      // tenantId comes from auth context; fall back to query param for now
      const tenantId =
        event.queryStringParameters?.tenantId ?? 'default-tenant';

      const configuredConnections =
        await connectionProvider.getConfiguredConnections(tenantId);

      const response: TemplateDetailResponse = buildDetailResponse(
        template,
        configuredConnections,
      );

      return jsonResponse(200, response);
    } catch (error) {
      console.error('Error getting template:', error);
      return jsonResponse(500, { message: 'Internal server error' });
    }
  };
}

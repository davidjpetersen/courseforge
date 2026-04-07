import type { AuditEntry } from '../../../packages/types/src/audit.js';
import type { WriteAuditInput } from '../../../packages/utils/src/audit.js';
import { ActionType } from '../../../packages/types/src/audit.js';
import { formatAuditCsv } from './csv.js';

// ── Minimal API Gateway types (local, matching environments/handler.ts pattern) ──

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

// ── Domain types ──

export interface AuditFilters {
  actor?: string;
  actionType?: string;
  resourceType?: string;
  resourceId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  cursor?: string;
}

export interface AuditRepository {
  query(tenantId: string, filters: AuditFilters): Promise<{ entries: AuditEntry[]; nextCursor?: string }>;
  queryAll(tenantId: string, filters: AuditFilters): Promise<AuditEntry[]>;
}

// ── Response helpers ──

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

function getHeader(headers: Record<string, string> | null | undefined, key: string): string | null {
  if (!headers) return null;
  const match = Object.entries(headers).find(
    ([header]) => header.toLowerCase() === key.toLowerCase(),
  );
  return match ? match[1] : null;
}

// ── Handler factories ──

export function createQueryAuditHandler(
  repo: AuditRepository,
): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const tenantId = getHeader(event.headers, 'x-tenant-id');
    if (!tenantId) {
      return jsonResponse(400, { message: 'Missing x-tenant-id header' });
    }

    const userRole = getHeader(event.headers, 'x-user-role');
    if (userRole !== 'Admin') {
      return jsonResponse(403, { message: 'Admin role required' });
    }

    const params = event.queryStringParameters ?? {};
    const filters: AuditFilters = {
      actor: params.actor,
      actionType: params.actionType,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      limit: params.limit ? Number(params.limit) : 100,
      cursor: params.cursor,
    };

    const result = await repo.query(tenantId, filters);

    return jsonResponse(200, { entries: result.entries, nextCursor: result.nextCursor });
  };
}

export function createExportAuditHandler(
  repo: AuditRepository,
  auditWriter: { write: (entry: WriteAuditInput) => Promise<void> },
): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const tenantId = getHeader(event.headers, 'x-tenant-id');
    if (!tenantId) {
      return jsonResponse(400, { message: 'Missing x-tenant-id header' });
    }

    const userRole = getHeader(event.headers, 'x-user-role');
    if (userRole !== 'Admin') {
      return jsonResponse(403, { message: 'Admin role required' });
    }

    const params = event.queryStringParameters ?? {};
    const filters: AuditFilters = {
      actor: params.actor,
      actionType: params.actionType,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    };

    const entries = await repo.queryAll(tenantId, filters);
    const csv = formatAuditCsv(entries);

    await auditWriter.write({
      tenantId,
      actor: getHeader(event.headers, 'x-user-id') ?? 'unknown',
      actorEmail: getHeader(event.headers, 'x-user-email') ?? '',
      actionType: ActionType.AUDIT_LOG_EXPORTED,
      resourceType: 'environment',
      resourceId: tenantId,
      detail: {
        recordCount: entries.length,
        filterParams: filters,
      },
      ipAddress: getHeader(event.headers, 'x-forwarded-for') ?? '',
      userAgent: getHeader(event.headers, 'user-agent') ?? '',
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="audit-log.csv"',
      },
      body: csv,
    };
  };
}

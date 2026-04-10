import { randomBytes, createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';

import type { ApiKeyRecord, ApiKeyScope } from '../../../packages/types/src/api-keys';
import type { ApiKeyRepository } from './repository';

// ── Minimal API Gateway types (matching existing pattern) ──

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

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

// ── Key generation helpers ──

export function generateRawKey(): string {
  const bytes = randomBytes(32);
  const encoded = bytes.toString('base64url');
  return `cfk_live_${encoded}`;
}

export function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

// ── Validation ──

const VALID_SCOPES: ReadonlySet<string> = new Set(['read', 'write']);

function isValidScope(value: unknown): value is ApiKeyScope {
  return typeof value === 'string' && VALID_SCOPES.has(value);
}

// ── Handler factory ──

export function createApiKeyHandler(repo: ApiKeyRepository) {
  return {
    async create(
      tenantId: string,
      createdBy: string,
      body: { name: unknown; scope: unknown },
    ): Promise<APIGatewayProxyResult> {
      const { name, scope } = body;

      if (typeof name !== 'string' || name.trim().length === 0) {
        return jsonResponse(400, { error: 'name must be a non-empty string' });
      }

      if (!isValidScope(scope)) {
        return jsonResponse(400, { error: "scope must be 'read' or 'write'" });
      }

      const rawKey = generateRawKey();
      const hashedKey = hashKey(rawKey);
      const keyId = randomUUID();
      const now = new Date().toISOString();

      const record: ApiKeyRecord = {
        keyId,
        tenantId,
        name: name.trim(),
        hashedKey,
        scope,
        createdBy,
        createdAt: now,
        lastUsedAt: null,
        enabled: true,
        deletedAt: null,
      };

      await repo.create(record);

      return jsonResponse(200, {
        keyId,
        key: rawKey,
        scope,
        name: record.name,
      });
    },

    async list(tenantId: string): Promise<APIGatewayProxyResult> {
      const records = await repo.listByTenant(tenantId);

      const keys = records.map(({ hashedKey: _h, ...rest }) => rest);

      return jsonResponse(200, keys);
    },

    async revoke(tenantId: string, keyId: string): Promise<APIGatewayProxyResult> {
      const existing = await repo.getByKeyId(tenantId, keyId);

      if (!existing) {
        return jsonResponse(404, { error: 'Not found' });
      }

      const deletedAt = new Date().toISOString();
      await repo.revoke(tenantId, keyId, deletedAt);

      return jsonResponse(200, { message: 'Key revoked' });
    },
  };
}

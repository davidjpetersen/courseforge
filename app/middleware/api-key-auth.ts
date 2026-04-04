import { createHash, randomBytes, randomUUID } from 'node:crypto';

export type ApiKeyScope = 'read' | 'write';

export interface ApiKeyRecord {
  PK: string;
  SK: string;
  keyId: string;
  tenantId: string;
  name: string;
  hashedKey: string;
  scope: ApiKeyScope;
  createdBy: string;
  createdAt: string;
  lastUsedAt?: string;
  enabled: boolean;
  deletedAt?: string;
}

export interface DeveloperAuthContext {
  tenantId: string;
  scope: ApiKeyScope;
  keyId: string;
}

export interface RequestLike {
  headers?: Record<string, string | undefined>;
  method?: string;
  path?: string;
  auth?: DeveloperAuthContext;
}

export interface ApiKeyStore {
  create(record: ApiKeyRecord): Promise<void>;
  listByTenant(tenantId: string): Promise<ApiKeyRecord[]>;
  softDelete(tenantId: string, keyId: string, deletedAt: string): Promise<boolean>;
  findByHashedKey(hashedKey: string): Promise<ApiKeyRecord | undefined>;
  updateLastUsedAt(tenantId: string, keyId: string, lastUsedAt: string): Promise<void>;
}

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export function generateRawApiKey(): string {
  const base64Url = randomBytes(32).toString('base64url');
  return `cfk_live_${base64Url}`;
}

export function makeApiKeyRecord(input: {
  tenantId: string;
  name: string;
  scope: ApiKeyScope;
  createdBy: string;
  now?: string;
}): { key: string; record: ApiKeyRecord } {
  const keyId = randomUUID();
  const key = generateRawApiKey();
  const createdAt = input.now ?? new Date().toISOString();

  return {
    key,
    record: {
      PK: `TENANT#${input.tenantId}`,
      SK: `APIKEY#${keyId}`,
      keyId,
      tenantId: input.tenantId,
      name: input.name,
      hashedKey: hashApiKey(key),
      scope: input.scope,
      createdBy: input.createdBy,
      createdAt,
      enabled: true,
    },
  };
}

function getBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) {
    return undefined;
  }

  const [scheme, token] = authorization.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return undefined;
  }

  return token.trim();
}

export function createApiKeyAuthMiddleware(store: ApiKeyStore) {
  return async (request: RequestLike): Promise<{ ok: true; context: DeveloperAuthContext } | { ok: false; statusCode: 401; body: { error: string } }> => {
    const authHeader = request.headers?.authorization ?? request.headers?.Authorization;
    const token = getBearerToken(authHeader);

    if (!token) {
      return { ok: false, statusCode: 401, body: { error: 'Invalid or revoked API key' } };
    }

    const hashedKey = hashApiKey(token);
    const keyRecord = await store.findByHashedKey(hashedKey);

    if (!keyRecord || !keyRecord.enabled) {
      return { ok: false, statusCode: 401, body: { error: 'Invalid or revoked API key' } };
    }

    const context: DeveloperAuthContext = {
      tenantId: keyRecord.tenantId,
      scope: keyRecord.scope,
      keyId: keyRecord.keyId,
    };

    request.auth = context;

    void store.updateLastUsedAt(keyRecord.tenantId, keyRecord.keyId, new Date().toISOString());

    return { ok: true, context };
  };
}

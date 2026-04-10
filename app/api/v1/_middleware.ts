/**
 * Shared middleware chain for /api/v1/ routes.
 *
 * Provides: auth → rate limit → scope enforcement.
 * Each route file calls `runV1Middleware(request, method, path)` and checks
 * for an error response before proceeding to the handler.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

import { createApiKeyAuthMiddleware, type AuthContext } from '../../../src/api/middleware/api-key-auth';
import { createRateLimiter, type RateLimitRepository } from '../../../src/api/middleware/rate-limiter';
import { enforceScopeForRequest } from '../../../src/api/middleware/scope-enforcer';
import { createDynamoApiKeyRepository } from '../../../src/api/developer-keys/repository';
import { rateLimitPK, RATE_LIMIT_SK } from '../../../src/models/schema';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.MAIN_TABLE_NAME ?? 'CourseForgeRuns';

// ── Shared DynamoDB client (exported for route-level repos) ──

export { client, tableName };

// ── API Key Repository ──

const apiKeyRepo = createDynamoApiKeyRepository(client, tableName);

// ── Rate Limit Repository (DynamoDB-backed token bucket) ──

const rateLimitRepo: RateLimitRepository = {
  async getAndUpdate(tenantId, endpointGroup, now, capacity, windowSeconds) {
    const pk = rateLimitPK(tenantId, endpointGroup);
    const windowMs = windowSeconds * 1000;

    const existing = await client.send(new GetCommand({
      TableName: tableName,
      Key: { PK: pk, SK: RATE_LIMIT_SK },
    }));

    if (!existing.Item) {
      try {
        await client.send(new UpdateCommand({
          TableName: tableName,
          Key: { PK: pk, SK: RATE_LIMIT_SK },
          UpdateExpression: 'SET tokens = :tokens, lastRefillAt = :now, version = :newVersion',
          ConditionExpression: 'attribute_not_exists(PK)',
          ExpressionAttributeValues: { ':tokens': capacity - 1, ':now': now, ':newVersion': 1 },
        }));
      } catch { /* ignore conditional check — another request initialized it */ }
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const item = existing.Item as { tokens: number; lastRefillAt: number; version: number };
    const elapsed = now - item.lastRefillAt;
    const refillTokens = Math.floor((elapsed / windowMs) * capacity);
    const newTokens = Math.min(capacity, item.tokens + refillTokens);

    if (newTokens < 1) {
      const retryAfterSeconds = Math.ceil((1 - newTokens) / (capacity / windowSeconds));
      return { allowed: false, retryAfterSeconds };
    }

    try {
      await client.send(new UpdateCommand({
        TableName: tableName,
        Key: { PK: pk, SK: RATE_LIMIT_SK },
        UpdateExpression: 'SET tokens = :tokens, lastRefillAt = :now, version = :newVersion',
        ConditionExpression: 'version = :oldVersion',
        ExpressionAttributeValues: {
          ':tokens': newTokens - 1, ':now': now, ':newVersion': item.version + 1, ':oldVersion': item.version,
        },
      }));
    } catch {
      // Fail open on conditional check failure
      return { allowed: true, retryAfterSeconds: 0 };
    }

    return { allowed: true, retryAfterSeconds: 0 };
  },
};

// ── Middleware instances ──

const authenticate = createApiKeyAuthMiddleware(apiKeyRepo);
const rateLimit = createRateLimiter(rateLimitRepo);

// ── Middleware chain ──

export type MiddlewareResult =
  | { error: NextResponse }
  | { error?: undefined; auth: AuthContext };

export async function runV1Middleware(
  request: NextRequest,
  method: string,
  path: string,
): Promise<MiddlewareResult> {
  // 1. Auth
  const authResult = await authenticate({
    headers: Object.fromEntries(request.headers.entries()),
  });
  if ('statusCode' in authResult) {
    return { error: new NextResponse(authResult.body, { status: authResult.statusCode, headers: authResult.headers }) };
  }

  // 2. Rate limit
  const rateLimitResult = await rateLimit(authResult.tenantId, method, path);
  if (!rateLimitResult.allowed) {
    return {
      error: NextResponse.json(
        { error: 'Rate limit exceeded', retryAfterSeconds: rateLimitResult.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfterSeconds) } },
      ),
    };
  }

  // 3. Scope enforcement
  const scopeResult = enforceScopeForRequest(authResult.scope, method, path);
  if (scopeResult) {
    return { error: new NextResponse(scopeResult.body, { status: scopeResult.statusCode, headers: scopeResult.headers }) };
  }

  return { auth: authResult };
}

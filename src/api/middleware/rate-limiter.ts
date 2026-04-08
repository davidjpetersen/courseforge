import type { EndpointGroup } from '../../../packages/types/src/api-keys.js';

// ── Types ──

export interface RateLimitBucket {
  tokens: number;
  lastRefillAt: number;
  version: number;
}

export interface RateLimitRepository {
  getAndUpdate(
    tenantId: string,
    endpointGroup: EndpointGroup,
    now: number,
    capacity: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}

export interface RateLimitConfig {
  capacity?: number;
  windowSeconds?: number;
}

const DEFAULT_CAPACITY = 100;
const DEFAULT_WINDOW_SECONDS = 60;

// ── Endpoint Classification ──

export function classifyEndpointGroup(method: string, path: string): EndpointGroup {
  const upper = method.toUpperCase();

  if (upper === 'POST' && /\/api\/v1\/events\b/.test(path)) {
    return 'events';
  }

  if (upper === 'GET') {
    return 'read';
  }

  return 'write';
}

// ── Token Bucket Math (pure, exported for testing) ──

export function computeRefill(
  bucket: RateLimitBucket,
  now: number,
  capacity: number,
  windowSeconds: number,
): { newTokens: number; allowed: boolean; retryAfterSeconds: number } {
  const windowMs = windowSeconds * 1000;
  const elapsed = now - bucket.lastRefillAt;
  const refillTokens = Math.floor((elapsed / windowMs) * capacity);
  const newTokens = Math.min(capacity, bucket.tokens + refillTokens);

  if (newTokens < 1) {
    const tokensPerSecond = capacity / windowSeconds;
    const retryAfterSeconds = Math.ceil((1 - newTokens) / tokensPerSecond);
    return { newTokens, allowed: false, retryAfterSeconds };
  }

  return { newTokens, allowed: true, retryAfterSeconds: 0 };
}

// ── Rate Limiter Factory ──

export function createRateLimiter(
  repo: RateLimitRepository,
  config?: RateLimitConfig,
): (tenantId: string, method: string, path: string) => Promise<
  { allowed: true } | { allowed: false; retryAfterSeconds: number }
> {
  const capacity = config?.capacity ?? DEFAULT_CAPACITY;
  const windowSeconds = config?.windowSeconds ?? DEFAULT_WINDOW_SECONDS;

  return async (tenantId, method, path) => {
    const endpointGroup = classifyEndpointGroup(method, path);
    const now = Date.now();

    const result = await repo.getAndUpdate(
      tenantId,
      endpointGroup,
      now,
      capacity,
      windowSeconds,
    );

    if (result.allowed) {
      return { allowed: true as const };
    }

    return { allowed: false as const, retryAfterSeconds: result.retryAfterSeconds };
  };
}

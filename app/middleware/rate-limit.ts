export type EndpointGroup = 'read' | 'write' | 'events';

export interface TokenBucketRecord {
  key: string;
  tokens: number;
  lastRefillAt: number;
  version: number;
}

export interface RateLimitStore {
  get(key: string): Promise<TokenBucketRecord | undefined>;
  putIfVersion(record: TokenBucketRecord, expectedVersion: number): Promise<boolean>;
  putIfAbsent(record: TokenBucketRecord): Promise<boolean>;
}

export interface RateLimitConfig {
  capacity: number;
  refillWindowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
  remaining?: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  capacity: 100,
  refillWindowSeconds: 60,
};

export function resolveEndpointGroup(method: string, path: string): EndpointGroup {
  if (method.toUpperCase() === 'POST' && /\/events$/.test(path)) {
    return 'events';
  }

  if (method.toUpperCase() === 'GET') {
    return 'read';
  }

  return 'write';
}

export function buildRateLimitBucketKey(tenantId: string, endpointGroup: EndpointGroup): string {
  return `RATELIMIT#${tenantId}#${endpointGroup}`;
}

function refillTokens(record: TokenBucketRecord, nowMs: number, config: RateLimitConfig): number {
  const refillPerSecond = config.capacity / config.refillWindowSeconds;
  const elapsedSeconds = Math.max(0, (nowMs - record.lastRefillAt) / 1000);
  return Math.min(config.capacity, record.tokens + elapsedSeconds * refillPerSecond);
}

export function createRateLimitMiddleware(store: RateLimitStore, config: Partial<RateLimitConfig> = {}) {
  const resolvedConfig: RateLimitConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  return async (input: {
    tenantId: string;
    endpointGroup: EndpointGroup;
    nowMs?: number;
  }): Promise<RateLimitResult> => {
    const nowMs = input.nowMs ?? Date.now();
    const key = buildRateLimitBucketKey(input.tenantId, input.endpointGroup);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = await store.get(key);

      if (!current) {
        const created: TokenBucketRecord = {
          key,
          tokens: resolvedConfig.capacity - 1,
          lastRefillAt: nowMs,
          version: 1,
        };
        const inserted = await store.putIfAbsent(created);
        if (inserted) {
          return { allowed: true, remaining: created.tokens };
        }
        continue;
      }

      const refilledTokens = refillTokens(current, nowMs, resolvedConfig);

      if (refilledTokens < 1) {
        const refillPerSecond = resolvedConfig.capacity / resolvedConfig.refillWindowSeconds;
        const needed = 1 - refilledTokens;
        return {
          allowed: false,
          retryAfter: Math.max(1, Math.ceil(needed / refillPerSecond)),
          remaining: 0,
        };
      }

      const updated: TokenBucketRecord = {
        ...current,
        tokens: refilledTokens - 1,
        lastRefillAt: nowMs,
        version: current.version + 1,
      };

      const updatedOk = await store.putIfVersion(updated, current.version);
      if (updatedOk) {
        return {
          allowed: true,
          remaining: Math.floor(updated.tokens),
        };
      }
    }

    return { allowed: false, retryAfter: 1, remaining: 0 };
  };
}

export function buildRateLimitError(retryAfter: number) {
  return {
    statusCode: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfter),
    },
    body: JSON.stringify({
      error: 'Rate limit exceeded',
      retryAfter,
    }),
  };
}

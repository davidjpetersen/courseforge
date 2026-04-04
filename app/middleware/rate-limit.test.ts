import { describe, expect, it } from 'vitest';

import { createRateLimitMiddleware, type RateLimitStore, type TokenBucketRecord } from './rate-limit.js';

class InMemoryRateLimitStore implements RateLimitStore {
  private readonly data = new Map<string, TokenBucketRecord>();

  async get(key: string): Promise<TokenBucketRecord | undefined> {
    const record = this.data.get(key);
    return record ? { ...record } : undefined;
  }

  async putIfVersion(record: TokenBucketRecord, expectedVersion: number): Promise<boolean> {
    const current = this.data.get(record.key);
    if (!current || current.version !== expectedVersion) {
      return false;
    }
    this.data.set(record.key, { ...record });
    return true;
  }

  async putIfAbsent(record: TokenBucketRecord): Promise<boolean> {
    if (this.data.has(record.key)) {
      return false;
    }
    this.data.set(record.key, { ...record });
    return true;
  }
}

describe('rate limit middleware', () => {
  it('deducts tokens on first request and allows it', async () => {
    const store = new InMemoryRateLimitStore();
    const limiter = createRateLimitMiddleware(store);

    const result = await limiter({ tenantId: 'tenant-1', endpointGroup: 'read', nowMs: 0 });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(99);
  });

  it('allows a 100 request burst in 60s and blocks the 101st request', async () => {
    const store = new InMemoryRateLimitStore();
    const limiter = createRateLimitMiddleware(store);

    for (let i = 0; i < 100; i += 1) {
      const result = await limiter({ tenantId: 'tenant-1', endpointGroup: 'write', nowMs: 0 });
      expect(result.allowed).toBe(true);
    }

    const limited = await limiter({ tenantId: 'tenant-1', endpointGroup: 'write', nowMs: 0 });

    expect(limited.allowed).toBe(false);
    expect(limited.retryAfter).toBe(1);
  });

  it('refills tokens after the window expires and allows requests again', async () => {
    const store = new InMemoryRateLimitStore();
    const limiter = createRateLimitMiddleware(store);

    for (let i = 0; i < 100; i += 1) {
      await limiter({ tenantId: 'tenant-1', endpointGroup: 'events', nowMs: 0 });
    }

    const limited = await limiter({ tenantId: 'tenant-1', endpointGroup: 'events', nowMs: 0 });
    expect(limited.allowed).toBe(false);

    const afterWindow = await limiter({ tenantId: 'tenant-1', endpointGroup: 'events', nowMs: 61_000 });

    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.remaining).toBe(99);
  });
});

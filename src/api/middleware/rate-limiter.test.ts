import { describe, it, expect } from 'vitest';

import {
  classifyEndpointGroup,
  computeRefill,
  createRateLimiter,
} from './rate-limiter.js';
import type { RateLimitBucket, RateLimitRepository } from './rate-limiter.js';
import type { EndpointGroup } from '../../../packages/types/src/api-keys.js';

// ── In-memory repository (mirrors property test helper) ──

function createInMemoryRateLimitRepo(): RateLimitRepository {
  const buckets = new Map<string, RateLimitBucket>();

  return {
    async getAndUpdate(
      tenantId: string,
      endpointGroup: EndpointGroup,
      now: number,
      capacity: number,
      windowSeconds: number,
    ) {
      const key = `${tenantId}#${endpointGroup}`;
      let bucket = buckets.get(key);

      if (!bucket) {
        bucket = { tokens: capacity, lastRefillAt: now, version: 0 };
      }

      const result = computeRefill(bucket, now, capacity, windowSeconds);

      if (result.allowed) {
        buckets.set(key, {
          tokens: result.newTokens - 1,
          lastRefillAt: now,
          version: bucket.version + 1,
        });
        return { allowed: true, retryAfterSeconds: 0 };
      }

      return { allowed: false, retryAfterSeconds: result.retryAfterSeconds };
    },
  };
}

// ── classifyEndpointGroup (Requirement 5.2) ──

describe('classifyEndpointGroup', () => {
  it('returns "events" for POST /api/v1/events', () => {
    expect(classifyEndpointGroup('POST', '/api/v1/events')).toBe('events');
  });

  it('returns "read" for GET /api/v1/workflows', () => {
    expect(classifyEndpointGroup('GET', '/api/v1/workflows')).toBe('read');
  });

  it('returns "write" for POST /api/v1/workflows', () => {
    expect(classifyEndpointGroup('POST', '/api/v1/workflows')).toBe('write');
  });

  it('returns "write" for DELETE /api/v1/workflows/123', () => {
    expect(classifyEndpointGroup('DELETE', '/api/v1/workflows/123')).toBe('write');
  });

  it('returns "read" for GET /api/v1/runs', () => {
    expect(classifyEndpointGroup('GET', '/api/v1/runs')).toBe('read');
  });

  it('returns "write" for PUT /api/v1/workflows/abc', () => {
    expect(classifyEndpointGroup('PUT', '/api/v1/workflows/abc')).toBe('write');
  });

  it('is case-insensitive for method', () => {
    expect(classifyEndpointGroup('post', '/api/v1/events')).toBe('events');
    expect(classifyEndpointGroup('get', '/api/v1/runs')).toBe('read');
  });
});

// ── computeRefill (Requirements 5.4, 5.5) ──

describe('computeRefill', () => {
  it('allows when bucket is full', () => {
    const now = 1_000_000;
    const bucket: RateLimitBucket = { tokens: 100, lastRefillAt: now, version: 0 };

    const result = computeRefill(bucket, now, 100, 60);

    expect(result.allowed).toBe(true);
    expect(result.newTokens).toBe(100);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it('rejects when bucket is empty and no time has elapsed', () => {
    const now = 1_000_000;
    const bucket: RateLimitBucket = { tokens: 0, lastRefillAt: now, version: 0 };

    const result = computeRefill(bucket, now, 100, 60);

    expect(result.allowed).toBe(false);
    expect(result.newTokens).toBe(0);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('computes correct retryAfterSeconds for empty bucket', () => {
    const now = 1_000_000;
    const bucket: RateLimitBucket = { tokens: 0, lastRefillAt: now, version: 0 };

    const result = computeRefill(bucket, now, 100, 60);

    // tokensPerSecond = 100/60 ≈ 1.667, retryAfter = ceil(1 / 1.667) = 1
    expect(result.retryAfterSeconds).toBe(1);
  });

  it('partially refills tokens based on elapsed time', () => {
    const baseTime = 1_000_000;
    // 30 seconds elapsed = half the 60s window → refill floor(30000/60000 * 100) = 50 tokens
    const bucket: RateLimitBucket = { tokens: 0, lastRefillAt: baseTime, version: 0 };

    const result = computeRefill(bucket, baseTime + 30_000, 100, 60);

    expect(result.newTokens).toBe(50);
    expect(result.allowed).toBe(true);
  });

  it('caps refill at capacity', () => {
    const baseTime = 1_000_000;
    // 90 tokens + full window elapsed → should cap at 100
    const bucket: RateLimitBucket = { tokens: 90, lastRefillAt: baseTime, version: 0 };

    const result = computeRefill(bucket, baseTime + 60_000, 100, 60);

    expect(result.newTokens).toBe(100);
  });

  it('refills fully after full window from empty', () => {
    const baseTime = 1_000_000;
    const bucket: RateLimitBucket = { tokens: 0, lastRefillAt: baseTime, version: 0 };

    const result = computeRefill(bucket, baseTime + 60_000, 100, 60);

    expect(result.newTokens).toBe(100);
    expect(result.allowed).toBe(true);
  });
});

// ── createRateLimiter (Requirements 5.1, 5.3, 18.1, 18.2, 18.3) ──

describe('createRateLimiter', () => {
  it('allows the first request (bucket initialization)', async () => {
    const repo = createInMemoryRateLimitRepo();
    const limiter = createRateLimiter(repo, { capacity: 100, windowSeconds: 60 });

    const result = await limiter('tenant-1', 'GET', '/api/v1/workflows');

    expect(result.allowed).toBe(true);
  });

  it('allows the 100th request within the window', async () => {
    const repo = createInMemoryRateLimitRepo();
    const limiter = createRateLimiter(repo, { capacity: 100, windowSeconds: 60 });

    for (let i = 0; i < 99; i++) {
      await limiter('tenant-1', 'GET', '/api/v1/workflows');
    }

    const result = await limiter('tenant-1', 'GET', '/api/v1/workflows');
    expect(result.allowed).toBe(true);
  });

  it('rejects the 101st request within the window', async () => {
    const repo = createInMemoryRateLimitRepo();
    const limiter = createRateLimiter(repo, { capacity: 100, windowSeconds: 60 });

    for (let i = 0; i < 100; i++) {
      await limiter('tenant-1', 'GET', '/api/v1/workflows');
    }

    const result = await limiter('tenant-1', 'GET', '/api/v1/workflows');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('maintains separate buckets per tenant', async () => {
    const repo = createInMemoryRateLimitRepo();
    const limiter = createRateLimiter(repo, { capacity: 100, windowSeconds: 60 });

    // Exhaust tenant-1's read bucket
    for (let i = 0; i < 100; i++) {
      await limiter('tenant-1', 'GET', '/api/v1/workflows');
    }

    const tenant1Result = await limiter('tenant-1', 'GET', '/api/v1/workflows');
    expect(tenant1Result.allowed).toBe(false);

    // tenant-2 should still have full capacity
    const tenant2Result = await limiter('tenant-2', 'GET', '/api/v1/workflows');
    expect(tenant2Result.allowed).toBe(true);
  });

  it('maintains separate buckets per endpoint group', async () => {
    const repo = createInMemoryRateLimitRepo();
    const limiter = createRateLimiter(repo, { capacity: 100, windowSeconds: 60 });

    // Exhaust the 'read' bucket for tenant-1
    for (let i = 0; i < 100; i++) {
      await limiter('tenant-1', 'GET', '/api/v1/workflows');
    }

    const readResult = await limiter('tenant-1', 'GET', '/api/v1/workflows');
    expect(readResult.allowed).toBe(false);

    // 'write' bucket should still have capacity
    const writeResult = await limiter('tenant-1', 'POST', '/api/v1/workflows');
    expect(writeResult.allowed).toBe(true);

    // 'events' bucket should still have capacity
    const eventsResult = await limiter('tenant-1', 'POST', '/api/v1/events');
    expect(eventsResult.allowed).toBe(true);
  });
});

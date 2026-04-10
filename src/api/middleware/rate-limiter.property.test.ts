import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  classifyEndpointGroup,
  computeRefill,
  createRateLimiter,
} from './rate-limiter';
import type { RateLimitBucket, RateLimitRepository } from './rate-limiter';
import type { EndpointGroup } from '../../../packages/types/src/api-keys';

// ── In-memory repository for Properties 7 & 8 ──

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

// ── Arbitraries ──

const arbHttpMethod = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE');
const arbGetMethod = fc.constant('GET');
const arbMutationMethod = fc.constantFrom('POST', 'PUT', 'DELETE');

const arbEventsPath = fc.constant('/api/v1/events');

const arbNonEventsPath = fc.constantFrom(
  '/api/v1/workflows',
  '/api/v1/workflows/abc-123',
  '/api/v1/runs',
  '/api/v1/runs/run-1',
  '/api/v1/recipes',
  '/api/v1/openapi.json',
);

const arbPath = fc.oneof(arbEventsPath, arbNonEventsPath);

const arbTenantId = fc.stringOf(
  fc.constantFrom('a', 'b', 'c', '1', '2', '3', '-'),
  { minLength: 1, maxLength: 20 },
);

// ── Property 5: Endpoint group classification ──

describe('Feature: developer-rest-api, Property 5: Endpoint group classification', () => {
  /**
   * Validates: Requirements 5.2
   *
   * For any HTTP method and path, classifyEndpointGroup SHALL return 'events'
   * when method is POST and path matches /api/v1/events, 'read' when method is
   * GET, and 'write' for all other POST, PUT, and DELETE requests.
   */

  it('returns "events" for POST /api/v1/events', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('post', 'POST', 'Post'),
        (method) => {
          expect(classifyEndpointGroup(method, '/api/v1/events')).toBe('events');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns "read" for any GET request', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('get', 'GET', 'Get'),
        arbPath,
        (method, path) => {
          expect(classifyEndpointGroup(method, path)).toBe('read');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns "write" for non-GET, non-events mutations', () => {
    fc.assert(
      fc.property(arbMutationMethod, arbNonEventsPath, (method, path) => {
        expect(classifyEndpointGroup(method, path)).toBe('write');
      }),
      { numRuns: 100 },
    );
  });

  it('returns "write" for PUT and DELETE even on events path', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('PUT', 'DELETE'),
        (method) => {
          expect(classifyEndpointGroup(method, '/api/v1/events')).toBe('write');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 6: Token bucket refill calculation ──

describe('Feature: developer-rest-api, Property 6: Token bucket refill calculation', () => {
  /**
   * Validates: Requirements 5.4, 5.5
   *
   * For any bucket state and current time, computeRefill produces correct refill
   * math: min(capacity, tokens + floor(elapsed/windowMs * capacity)).
   */

  const arbCapacity = fc.integer({ min: 1, max: 1000 });
  const arbWindowSeconds = fc.integer({ min: 1, max: 3600 });
  const arbTokens = fc.integer({ min: 0, max: 1000 });
  const arbTimestamp = fc.integer({ min: 0, max: 1_000_000_000 });

  it('computes newTokens as min(capacity, tokens + floor(elapsed/windowMs * capacity))', () => {
    fc.assert(
      fc.property(
        arbTokens,
        arbTimestamp,
        arbCapacity,
        arbWindowSeconds,
        (tokens, baseTime, capacity, windowSeconds) => {
          // Ensure tokens <= capacity for realistic bucket state
          const clampedTokens = Math.min(tokens, capacity);
          const elapsed = fc.sample(fc.integer({ min: 0, max: windowSeconds * 2000 }), 1)[0];
          const now = baseTime + elapsed;

          const bucket: RateLimitBucket = {
            tokens: clampedTokens,
            lastRefillAt: baseTime,
            version: 0,
          };

          const result = computeRefill(bucket, now, capacity, windowSeconds);
          const windowMs = windowSeconds * 1000;
          const expectedRefill = Math.floor((elapsed / windowMs) * capacity);
          const expectedTokens = Math.min(capacity, clampedTokens + expectedRefill);

          expect(result.newTokens).toBe(expectedTokens);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('returns allowed=true when newTokens >= 1', () => {
    fc.assert(
      fc.property(
        arbCapacity,
        arbWindowSeconds,
        (capacity, windowSeconds) => {
          // Full bucket should always allow
          const bucket: RateLimitBucket = {
            tokens: capacity,
            lastRefillAt: Date.now(),
            version: 0,
          };

          const result = computeRefill(bucket, Date.now(), capacity, windowSeconds);
          expect(result.allowed).toBe(true);
          expect(result.retryAfterSeconds).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns allowed=false with retryAfterSeconds when newTokens < 1', () => {
    fc.assert(
      fc.property(
        arbCapacity,
        arbWindowSeconds,
        (capacity, windowSeconds) => {
          // Empty bucket, no time elapsed
          const now = Date.now();
          const bucket: RateLimitBucket = {
            tokens: 0,
            lastRefillAt: now,
            version: 0,
          };

          const result = computeRefill(bucket, now, capacity, windowSeconds);
          expect(result.allowed).toBe(false);
          expect(result.retryAfterSeconds).toBeGreaterThan(0);

          // retryAfterSeconds = ceil((1 - 0) / (capacity / windowSeconds))
          const tokensPerSecond = capacity / windowSeconds;
          const expected = Math.ceil(1 / tokensPerSecond);
          expect(result.retryAfterSeconds).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('never exceeds capacity after refill', () => {
    fc.assert(
      fc.property(
        arbTokens,
        arbTimestamp,
        arbCapacity,
        arbWindowSeconds,
        fc.integer({ min: 0, max: 10_000_000 }),
        (tokens, baseTime, capacity, windowSeconds, elapsed) => {
          const clampedTokens = Math.min(tokens, capacity);
          const bucket: RateLimitBucket = {
            tokens: clampedTokens,
            lastRefillAt: baseTime,
            version: 0,
          };

          const result = computeRefill(bucket, baseTime + elapsed, capacity, windowSeconds);
          expect(result.newTokens).toBeLessThanOrEqual(capacity);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ── Property 7: Token bucket boundary enforcement ──

describe('Feature: developer-rest-api, Property 7: Token bucket boundary enforcement', () => {
  /**
   * Validates: Requirements 5.3, 18.1, 18.2
   *
   * For default capacity 100, exactly 100 requests within a single 60-second
   * window SHALL all be allowed, and the 101st request SHALL be rejected.
   */

  it('allows exactly 100 requests and rejects the 101st', async () => {
    await fc.assert(
      fc.asyncProperty(arbTenantId, async (tenantId) => {
        const repo = createInMemoryRateLimitRepo();
        const limiter = createRateLimiter(repo, { capacity: 100, windowSeconds: 60 });

        // Send 100 requests — all should be allowed
        for (let i = 0; i < 100; i++) {
          const result = await limiter(tenantId, 'GET', '/api/v1/workflows');
          expect(result.allowed).toBe(true);
        }

        // 101st request should be rejected
        const rejected = await limiter(tenantId, 'GET', '/api/v1/workflows');
        expect(rejected.allowed).toBe(false);
        if (!rejected.allowed) {
          expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
        }
      }),
      { numRuns: 10 },
    );
  });

  it('tracks separate buckets per endpoint group', async () => {
    await fc.assert(
      fc.asyncProperty(arbTenantId, async (tenantId) => {
        const repo = createInMemoryRateLimitRepo();
        const limiter = createRateLimiter(repo, { capacity: 100, windowSeconds: 60 });

        // Exhaust 'read' bucket
        for (let i = 0; i < 100; i++) {
          await limiter(tenantId, 'GET', '/api/v1/workflows');
        }

        // 'write' bucket should still have capacity
        const writeResult = await limiter(tenantId, 'POST', '/api/v1/workflows');
        expect(writeResult.allowed).toBe(true);

        // 'events' bucket should still have capacity
        const eventsResult = await limiter(tenantId, 'POST', '/api/v1/events');
        expect(eventsResult.allowed).toBe(true);
      }),
      { numRuns: 10 },
    );
  });
});

// ── Property 8: Token bucket refill restores capacity ──

describe('Feature: developer-rest-api, Property 8: Token bucket refill restores capacity', () => {
  /**
   * Validates: Requirements 18.3
   *
   * After exhausting tokens, advancing time by full window restores capacity.
   */

  it('refills to full capacity after full window elapses', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 3600 }),
        (capacity, windowSeconds) => {
          const baseTime = 1_000_000;
          const windowMs = windowSeconds * 1000;

          // Exhausted bucket: 0 tokens
          const bucket: RateLimitBucket = {
            tokens: 0,
            lastRefillAt: baseTime,
            version: 0,
          };

          // Advance by exactly one full window
          const result = computeRefill(bucket, baseTime + windowMs, capacity, windowSeconds);

          // Should refill to full capacity
          expect(result.newTokens).toBe(capacity);
          expect(result.allowed).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('allows requests after exhaustion when full window elapses (integration)', async () => {
    await fc.assert(
      fc.asyncProperty(arbTenantId, async (tenantId) => {
        // Use a time-controllable repo to simulate time advancement
        let currentTime = 1_000_000_000;
        const buckets = new Map<string, RateLimitBucket>();

        const repo: RateLimitRepository = {
          async getAndUpdate(tid, group, _now, capacity, windowSeconds) {
            const key = `${tid}#${group}`;
            let bucket = buckets.get(key);

            if (!bucket) {
              bucket = { tokens: capacity, lastRefillAt: currentTime, version: 0 };
            }

            const result = computeRefill(bucket, currentTime, capacity, windowSeconds);

            if (result.allowed) {
              buckets.set(key, {
                tokens: result.newTokens - 1,
                lastRefillAt: currentTime,
                version: bucket.version + 1,
              });
              return { allowed: true, retryAfterSeconds: 0 };
            }

            return { allowed: false, retryAfterSeconds: result.retryAfterSeconds };
          },
        };

        const capacity = 100;
        const windowSeconds = 60;
        const limiter = createRateLimiter(repo, { capacity, windowSeconds });

        // Exhaust all tokens
        for (let i = 0; i < capacity; i++) {
          const r = await limiter(tenantId, 'GET', '/api/v1/runs');
          expect(r.allowed).toBe(true);
        }

        // Verify exhausted
        const exhausted = await limiter(tenantId, 'GET', '/api/v1/runs');
        expect(exhausted.allowed).toBe(false);

        // Advance time by full window
        currentTime += windowSeconds * 1000;

        // Should be allowed again
        const restored = await limiter(tenantId, 'GET', '/api/v1/runs');
        expect(restored.allowed).toBe(true);
      }),
      { numRuns: 10 },
    );
  });
});

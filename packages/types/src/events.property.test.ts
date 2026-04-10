import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { DomainEvent } from './events';

// ── Generator ──

/**
 * JSON-serializable value that avoids -0 (which doesn't survive JSON round-trip).
 * fc.jsonValue() can produce -0, but JSON.stringify(-0) === "0", so deep equality fails.
 */
const arbJsonSafe = fc.jsonValue().map((v) => JSON.parse(JSON.stringify(v)));

/** Generates a valid DomainEvent with arbitrary string fields and JSON-serializable payload. */
const arbDomainEvent: fc.Arbitrary<DomainEvent> = fc.record({
  tenantId: fc.string(),
  workflowId: fc.string(),
  eventType: fc.string(),
  payload: arbJsonSafe,
  traceId: fc.string(),
  timestamp: fc.string(),
});

// ── Property 1: DomainEvent serialization round trip ──

describe('Feature: courseforge-foundation-infra, Property 1: DomainEvent serialization round trip', () => {
  /**
   * **Validates: Requirements 6.1**
   *
   * For any valid DomainEvent object (with arbitrary string values for
   * tenantId, workflowId, eventType, traceId, timestamp, and any
   * JSON-serializable payload), serializing to JSON and deserializing
   * back should produce an object deeply equal to the original.
   */
  it('JSON.parse(JSON.stringify(event)) deeply equals the original event', () => {
    fc.assert(
      fc.property(arbDomainEvent, (event) => {
        const roundTripped = JSON.parse(JSON.stringify(event));
        expect(roundTripped).toEqual(event);
      }),
      { numRuns: 100 },
    );
  });
});

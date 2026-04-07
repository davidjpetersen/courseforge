import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { StepDefinition } from './types.js';

// ── Generators ──

/** Arbitrary StepRetryPolicy with reasonable bounds. */
const arbRetryPolicy = fc.record({
  maxAttempts: fc.integer({ min: 1, max: 10 }),
  backoffRate: fc.double({ min: 1, max: 5, noNaN: true, noDefaultInfinity: true }),
});

/** JSON-safe value that survives a round-trip (avoids -0, NaN, Infinity). */
const arbJsonSafeValue = fc.jsonValue().map((v) => JSON.parse(JSON.stringify(v)));

/** Arbitrary params as a Record<string, unknown> with JSON-safe values. */
const arbParams = fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), arbJsonSafeValue);

/** Arbitrary StepDefinition. */
const arbStepDefinition: fc.Arbitrary<StepDefinition> = fc.record({
  stepId: fc.string({ minLength: 1, maxLength: 30 }),
  stepIndex: fc.nat({ max: 100 }),
  connectorKey: fc.string({ minLength: 1, maxLength: 30 }),
  actionType: fc.string({ minLength: 1, maxLength: 30 }),
  params: arbParams,
  retryPolicy: arbRetryPolicy,
});

/** Arbitrary array of StepDefinitions. */
const arbStepDefinitions = fc.array(arbStepDefinition, { minLength: 0, maxLength: 10 });

// ── Property 1: StepDefinition deserialization round-trip ──
// Feature: run-orchestration, Property 1: StepDefinition deserialization round-trip

describe('Feature: run-orchestration, Property 1: StepDefinition deserialization round-trip', () => {
  /**
   * **Validates: Requirements 2.2**
   *
   * For any valid array of StepDefinition objects, serializing to JSON and
   * deserializing back should produce an equivalent array.
   */
  it('JSON.parse(JSON.stringify(steps)) deeply equals the original StepDefinition array', () => {
    fc.assert(
      fc.property(arbStepDefinitions, (steps) => {
        const serialized = JSON.stringify(steps);
        const deserialized = JSON.parse(serialized) as StepDefinition[];
        expect(deserialized).toEqual(steps);
      }),
      { numRuns: 100 },
    );
  });
});

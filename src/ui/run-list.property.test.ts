import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { sortFailedFirst } from './run-list';
import { RunStatus } from '../../packages/types/src/events';
import type { Run } from '../../packages/types/src/runs';

/**
 * Validates: Requirements 5.5
 */

const runArb: fc.Arbitrary<Run> = fc.record({
  runId: fc.string({ minLength: 1 }),
  workflowId: fc.string({ minLength: 1 }),
  workflowName: fc.string(),
  tenantId: fc.string({ minLength: 1 }),
  versionId: fc.string({ minLength: 1 }),
  status: fc.constantFrom(...Object.values(RunStatus)),
  triggerType: fc.constantFrom('webhook' as const, 'scheduled' as const, 'replay' as const),
  triggerEventId: fc.string({ minLength: 1 }),
  startedAt: fc.date().map((d) => d.toISOString()),
  endedAt: fc.option(fc.date().map((d) => d.toISOString()), { nil: undefined }),
  durationMs: fc.option(fc.nat(), { nil: undefined }),
  parentRunId: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  failedStepId: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
});

describe('Property 4: sortFailedFirst preserves all elements', () => {
  it('output is a permutation of input (same length, same elements)', () => {
    fc.assert(
      fc.property(fc.array(runArb), (runs) => {
        const sorted = sortFailedFirst(runs);

        // Same length
        expect(sorted).toHaveLength(runs.length);

        // Same elements — every element in the input appears in the output
        // and vice versa. We compare by reference since sortFailedFirst
        // partitions the original array elements.
        const inputRefs = new Set(runs);
        const outputRefs = new Set(sorted);

        for (const run of runs) {
          expect(outputRefs.has(run)).toBe(true);
        }
        for (const run of sorted) {
          expect(inputRefs.has(run)).toBe(true);
        }
      }),
    );
  });
});

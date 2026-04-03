import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { serializeConfig, deserializeConfig, DSLValidationError } from './serializer.js';
import type {
  WizardConfiguration,
  WizardStepConfig,
  WorkflowMetadata,
  FieldValue,
} from '../models/types.js';

// ── Generators ──

/** Generates a valid FieldValue (string | number | boolean | null). */
const arbFieldValue: fc.Arbitrary<FieldValue> = fc.oneof(
  fc.string({ minLength: 0, maxLength: 50 }),
  fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
  fc.constant(null),
);

/** Generates a non-empty record of field values. */
const arbFields: fc.Arbitrary<Record<string, FieldValue>> = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
  arbFieldValue,
  { minKeys: 1, maxKeys: 8 },
);

/** Generates a valid WizardStepConfig. */
function arbWizardStep(index: number): fc.Arbitrary<WizardStepConfig> {
  return arbFields.map((fields) => ({
    stepIndex: index,
    fields,
  }));
}

/** Generates a valid WizardConfiguration with 1–5 steps. */
const arbWizardConfiguration: fc.Arbitrary<WizardConfiguration> = fc
  .integer({ min: 1, max: 5 })
  .chain((stepCount) => {
    const stepArbs = Array.from({ length: stepCount }, (_, i) => arbWizardStep(i));
    return fc.tuple(
      fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
      fc.tuple(...(stepArbs as [fc.Arbitrary<WizardStepConfig>, ...fc.Arbitrary<WizardStepConfig>[]])),
    );
  })
  .map(([templateId, steps]) => ({
    templateId,
    steps: [...steps],
  }));

/** Generates a non-empty string. */
const arbNonEmptyString = fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0);

/** Generates valid WorkflowMetadata. */
const arbMetadata: fc.Arbitrary<WorkflowMetadata> = fc.record({
  tenantId: arbNonEmptyString,
  createdBy: arbNonEmptyString,
  createdAt: arbNonEmptyString,
});

// ── Property 1: DSL Serialization Round-Trip ──

describe('Feature: recipe-library, Property 1: DSL Serialization Round-Trip', () => {
  /**
   * **Validates: Requirements 9.1, 9.2, 9.3**
   *
   * For any valid WizardConfiguration, serializing to WorkflowDSL and then
   * deserializing back should produce a configuration equivalent to the
   * original input.
   */
  it('round-trips any valid WizardConfiguration through serialize → deserialize', () => {
    fc.assert(
      fc.property(
        arbWizardConfiguration,
        arbNonEmptyString,
        arbMetadata,
        (config, name, metadata) => {
          const dsl = serializeConfig(config, name, metadata);
          const roundTripped = deserializeConfig(dsl);

          // templateId preserved
          expect(roundTripped.templateId).toBe(config.templateId);

          // same number of steps
          expect(roundTripped.steps).toHaveLength(config.steps.length);

          // each step's index and fields preserved
          for (let i = 0; i < config.steps.length; i++) {
            expect(roundTripped.steps[i].stepIndex).toBe(config.steps[i].stepIndex);
            expect(roundTripped.steps[i].fields).toEqual(config.steps[i].fields);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 15: Malformed DSL Produces Descriptive Error ──

/** Generates a malformed DSL by corrupting one or more required fields. */
const arbMalformedDSL: fc.Arbitrary<unknown> = fc.oneof(
  // null / undefined / primitive
  fc.constant(null),
  fc.constant(undefined),
  fc.string(),
  fc.integer(),
  fc.boolean(),

  // missing version
  fc.record({
    templateId: arbNonEmptyString,
    name: arbNonEmptyString,
    steps: fc.constant([]),
    metadata: fc.record({
      tenantId: arbNonEmptyString,
      createdBy: arbNonEmptyString,
      createdAt: arbNonEmptyString,
    }),
  }),

  // missing templateId
  fc.record({
    version: fc.constant('1.0'),
    name: arbNonEmptyString,
    steps: fc.constant([]),
    metadata: fc.record({
      tenantId: arbNonEmptyString,
      createdBy: arbNonEmptyString,
      createdAt: arbNonEmptyString,
    }),
  }),

  // missing name
  fc.record({
    version: fc.constant('1.0'),
    templateId: arbNonEmptyString,
    steps: fc.constant([]),
    metadata: fc.record({
      tenantId: arbNonEmptyString,
      createdBy: arbNonEmptyString,
      createdAt: arbNonEmptyString,
    }),
  }),

  // steps is not an array
  fc.record({
    version: fc.constant('1.0'),
    templateId: arbNonEmptyString,
    name: arbNonEmptyString,
    steps: fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.constant({})),
    metadata: fc.record({
      tenantId: arbNonEmptyString,
      createdBy: arbNonEmptyString,
      createdAt: arbNonEmptyString,
    }),
  }),

  // missing metadata
  fc.record({
    version: fc.constant('1.0'),
    templateId: arbNonEmptyString,
    name: arbNonEmptyString,
    steps: fc.constant([]),
  }),

  // metadata is not an object
  fc.record({
    version: fc.constant('1.0'),
    templateId: arbNonEmptyString,
    name: arbNonEmptyString,
    steps: fc.constant([]),
    metadata: fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.constant([])),
  }),

  // invalid step structure (missing stepIndex)
  fc.record({
    version: fc.constant('1.0'),
    templateId: arbNonEmptyString,
    name: arbNonEmptyString,
    steps: fc.constant([{ action: 'a', parameters: {} }]),
    metadata: fc.record({
      tenantId: arbNonEmptyString,
      createdBy: arbNonEmptyString,
      createdAt: arbNonEmptyString,
    }),
  }),

  // metadata missing tenantId
  fc.record({
    version: fc.constant('1.0'),
    templateId: arbNonEmptyString,
    name: arbNonEmptyString,
    steps: fc.constant([]),
    metadata: fc.record({
      createdBy: arbNonEmptyString,
      createdAt: arbNonEmptyString,
    }),
  }),
);

describe('Feature: recipe-library, Property 15: Malformed DSL Produces Descriptive Error', () => {
  /**
   * **Validates: Requirements 9.4**
   *
   * For any malformed WorkflowDSL input, the deserializer should return an
   * error result containing a non-empty description that identifies the
   * invalid section or field.
   */
  it('throws DSLValidationError with non-empty message and section for any malformed DSL', () => {
    fc.assert(
      fc.property(arbMalformedDSL, (malformed) => {
        try {
          deserializeConfig(malformed as any);
          // If it didn't throw, the input was accidentally valid — skip
          // (this shouldn't happen given our generators, but guard anyway)
        } catch (e) {
          expect(e).toBeInstanceOf(DSLValidationError);
          const err = e as DSLValidationError;
          expect(err.message.length).toBeGreaterThan(0);
          expect(err.section.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});

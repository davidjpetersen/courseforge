import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { Template, StepDefinition, FieldDefinition, FieldValue } from '../models/types';
import {
  createWizardState,
  getProgressIndicator,
  getCurrentStep,
  goToNextStep,
  goToPreviousStep,
  goToStep,
  setFieldValue,
  buildStepViewModel,
} from './wizard';

// ── Generators ──

const arbFieldType = fc.constantFrom('text', 'select', 'number', 'boolean', 'connection') as fc.Arbitrary<
  'text' | 'select' | 'number' | 'boolean' | 'connection'
>;

function arbFieldDefinition(index: number): fc.Arbitrary<FieldDefinition> {
  return fc
    .tuple(
      fc.string({ minLength: 1, maxLength: 20 }),
      arbFieldType,
      fc.boolean(),
      fc.string({ minLength: 1, maxLength: 40 }),
      fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
    )
    .map(([label, type, required, helpText, connectedSystem]) => ({
      fieldId: `field-${index}`,
      label,
      type,
      required,
      helpText,
      validation: {},
      connectedSystem,
    }));
}

function arbStepDefinition(stepIndex: number): fc.Arbitrary<StepDefinition> {
  return fc
    .tuple(
      fc.string({ minLength: 1, maxLength: 30 }),
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.integer({ min: 1, max: 5 }),
    )
    .chain(([title, helpText, fieldCount]) => {
      const fieldArbs = Array.from({ length: fieldCount }, (_, i) =>
        arbFieldDefinition(stepIndex * 10 + i),
      );
      return fc.tuple(fc.constant(title), fc.constant(helpText), fc.tuple(...fieldArbs));
    })
    .map(([title, helpText, fields]) => ({
      stepIndex,
      title,
      helpText,
      fields,
    }));
}

function arbTemplate(): fc.Arbitrary<Template> {
  return fc
    .integer({ min: 1, max: 6 })
    .chain((stepCount) => {
      const stepArbs = Array.from({ length: stepCount }, (_, i) => arbStepDefinition(i));
      return fc.tuple(fc.uuid(), fc.tuple(...stepArbs));
    })
    .map(([templateId, steps]) => ({
      templateId,
      name: 'Generated Template',
      description: 'Auto-generated for property testing',
      categories: ['Roster Ops'],
      connectedSystems: [],
      requiredParameters: [],
      timeToActivate: '5 min',
      educationStandardTags: [],
      steps,
      certified: true,
      createdAt: '2024-01-01T00:00:00Z',
    }));
}

const arbFieldValue: fc.Arbitrary<FieldValue> = fc.oneof(
  fc.string({ minLength: 0, maxLength: 30 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
);

// ── Property 5: Wizard Renders Correct Steps and Fields ──

describe('Feature: recipe-library, Property 5: Wizard Renders Correct Steps and Fields', () => {
  /**
   * **Validates: Requirements 3.1, 3.2**
   *
   * For any template schema, the wizard should render exactly the steps
   * defined in the template, in order, with each step containing exactly
   * the fields specified in the schema, each accompanied by its help text.
   */
  it('renders exactly the steps and fields defined in the template, with help text', () => {
    fc.assert(
      fc.property(arbTemplate(), (template) => {
        const state = createWizardState(template);

        // Wizard has exactly the right number of steps
        expect(state.totalSteps).toBe(template.steps.length);

        // For each step, verify the view model matches the template schema
        for (let i = 0; i < template.steps.length; i++) {
          const navigated = goToStep(state, i);
          const vm = getCurrentStep(navigated, template.steps);
          const stepDef = template.steps[i]!;

          // Step index and metadata match
          expect(vm.stepIndex).toBe(stepDef.stepIndex);
          expect(vm.title).toBe(stepDef.title);
          expect(vm.helpText).toBe(stepDef.helpText);

          // Exactly the right fields, in order
          expect(vm.fields).toHaveLength(stepDef.fields.length);
          for (let j = 0; j < stepDef.fields.length; j++) {
            const fieldDef = stepDef.fields[j]!;
            const fieldVm = vm.fields[j]!;

            expect(fieldVm.fieldId).toBe(fieldDef.fieldId);
            expect(fieldVm.label).toBe(fieldDef.label);
            expect(fieldVm.type).toBe(fieldDef.type);
            expect(fieldVm.required).toBe(fieldDef.required);
            expect(fieldVm.helpText).toBe(fieldDef.helpText);
            expect(fieldVm.connectedSystem).toBe(fieldDef.connectedSystem);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 6: Progress Indicator Accuracy ──

describe('Feature: recipe-library, Property 6: Progress Indicator Accuracy', () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * For any wizard with N total steps, when the user is on step K (1 ≤ K ≤ N),
   * the progress indicator should display K as the current step and N as the total.
   */
  it('displays correct current step and total for any step position', () => {
    fc.assert(
      fc.property(
        arbTemplate().chain((template) =>
          fc.tuple(
            fc.constant(template),
            fc.integer({ min: 0, max: template.steps.length - 1 }),
          ),
        ),
        ([template, stepIndex]) => {
          const state = goToStep(createWizardState(template), stepIndex);
          const progress = getProgressIndicator(state);

          // K is 1-based
          expect(progress.currentStep).toBe(stepIndex + 1);
          expect(progress.totalSteps).toBe(template.steps.length);

          // Bounds: 1 ≤ currentStep ≤ totalSteps
          expect(progress.currentStep).toBeGreaterThanOrEqual(1);
          expect(progress.currentStep).toBeLessThanOrEqual(progress.totalSteps);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 7: Backward Navigation Preserves Data ──

describe('Feature: recipe-library, Property 7: Backward Navigation Preserves Data', () => {
  /**
   * **Validates: Requirements 3.5**
   *
   * For any wizard state with data entered across multiple steps, navigating
   * backward to any previous step and then forward again should preserve all
   * previously entered field values.
   */
  it('preserves all field values after backward and forward navigation', () => {
    fc.assert(
      fc.property(
        arbTemplate().chain((template) => {
          // Generate a value for every field in every step
          const fieldValueArbs = template.steps.map((step) =>
            fc.tuple(
              ...step.fields.map(() => arbFieldValue),
            ),
          );
          return fc.tuple(
            fc.constant(template),
            fc.tuple(...fieldValueArbs),
          );
        }),
        ([template, allFieldValues]) => {
          let state = createWizardState(template);

          // Fill in all fields across all steps
          for (let si = 0; si < template.steps.length; si++) {
            const stepDef = template.steps[si]!;
            const values = allFieldValues[si]!;
            for (let fi = 0; fi < stepDef.fields.length; fi++) {
              state = setFieldValue(state, si, stepDef.fields[fi]!.fieldId, values[fi]!);
            }
          }

          // Snapshot all field values before navigation
          const snapshotBefore = state.steps.map((s) => ({ ...s.fields }));

          // Navigate to last step, then back to first, then forward to last
          state = goToStep(state, template.steps.length - 1);
          state = goToStep(state, 0);
          state = goToStep(state, template.steps.length - 1);

          // All field values must be preserved
          for (let si = 0; si < state.steps.length; si++) {
            expect(state.steps[si]!.fields).toEqual(snapshotBefore[si]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

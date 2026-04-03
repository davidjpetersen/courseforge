import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateAllSteps, findFirstErrorStep, isPublishEnabled, } from './validation.js';
// ── Generators ──
const arbFieldType = fc.constantFrom('text', 'select', 'number', 'boolean', 'connection');
function arbFieldDefinition(idSuffix, opts = {}) {
    return fc
        .tuple(fc.string({ minLength: 1, maxLength: 20 }), arbFieldType, opts.forceRequired !== undefined
        ? fc.constant(opts.forceRequired)
        : fc.boolean(), fc.string({ minLength: 1, maxLength: 40 }), fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }))
        .map(([label, type, required, helpText, connectedSystem]) => ({
        fieldId: `field-${idSuffix}`,
        label,
        type,
        required,
        helpText,
        validation: {},
        connectedSystem,
    }));
}
function arbStepDefinition(stepIndex) {
    return fc
        .integer({ min: 1, max: 4 })
        .chain((fieldCount) => {
        const fieldArbs = Array.from({ length: fieldCount }, (_, i) => arbFieldDefinition(`${stepIndex}-${i}`));
        return fc.tuple(fc.string({ minLength: 1, maxLength: 30 }), fc.string({ minLength: 1, maxLength: 50 }), fc.tuple(...fieldArbs));
    })
        .map(([title, helpText, fields]) => ({
        stepIndex,
        title,
        helpText,
        fields,
    }));
}
/** Generate a multi-step wizard definition. */
function arbSteps() {
    return fc
        .integer({ min: 1, max: 5 })
        .chain((count) => fc.tuple(...Array.from({ length: count }, (_, i) => arbStepDefinition(i))));
}
/** Generate a valid value for a given field type. */
function arbValidValueForType(type) {
    switch (type) {
        case 'text':
        case 'select':
        case 'connection':
            return fc.string({ minLength: 1, maxLength: 30 });
        case 'number':
            return fc.integer({ min: -1000, max: 1000 });
        case 'boolean':
            return fc.boolean();
    }
}
/** Generate an invalid value for a required field (null, empty, or wrong type). */
function arbInvalidValue(type) {
    // For required fields: null or empty string are always invalid
    const nullOrEmpty = fc.constantFrom(null, '');
    // Wrong type values
    const wrongType = type === 'number'
        ? fc.constant('not-a-number')
        : type === 'boolean'
            ? fc.constant(42)
            : fc.constant(true);
    return fc.oneof(nullOrEmpty, wrongType);
}
/** Build valid wizard state for all steps. */
function buildValidState(steps) {
    if (steps.length === 0)
        return fc.constant([]);
    const stepArbs = steps.map((step) => {
        if (step.fields.length === 0) {
            return fc.constant({
                stepIndex: step.stepIndex,
                fields: {},
            });
        }
        const fieldArbs = step.fields.map((f) => arbValidValueForType(f.type).map((v) => [f.fieldId, v]));
        return fc.tuple(...fieldArbs).map((pairs) => ({
            stepIndex: step.stepIndex,
            fields: Object.fromEntries(pairs),
        }));
    });
    return fc.tuple(...stepArbs);
}
/**
 * Build wizard state where at least one required field per designated step
 * is invalid, and all other fields are valid.
 */
function buildStateWithInvalidRequiredFields(steps, invalidStepIndices) {
    if (steps.length === 0)
        return fc.constant([]);
    const stepArbs = steps.map((step) => {
        const shouldBeInvalid = invalidStepIndices.has(step.stepIndex);
        const requiredFields = step.fields.filter((f) => f.required);
        const hasRequired = requiredFields.length > 0;
        if (step.fields.length === 0) {
            return fc.constant({
                stepIndex: step.stepIndex,
                fields: {},
            });
        }
        const fieldArbs = step.fields.map((f) => {
            if (shouldBeInvalid && hasRequired && f.required && f === requiredFields[0]) {
                // Make the first required field invalid
                return arbInvalidValue(f.type).map((v) => [f.fieldId, v]);
            }
            return arbValidValueForType(f.type).map((v) => [f.fieldId, v]);
        });
        return fc.tuple(...fieldArbs).map((pairs) => ({
            stepIndex: step.stepIndex,
            fields: Object.fromEntries(pairs),
        }));
    });
    return fc.tuple(...stepArbs);
}
// ── Property 8: Validation Identifies All Invalid Fields with Error Messages ──
describe('Feature: recipe-library, Property 8: Validation Identifies All Invalid Fields with Error Messages', () => {
    /**
     * **Validates: Requirements 4.1, 4.2, 4.3**
     *
     * For any wizard configuration containing one or more invalid required fields,
     * the validation function should return an error entry for each invalid field,
     * and each error entry should contain a non-empty, actionable error message.
     */
    it('returns an error with non-empty message for every invalid required field', () => {
        fc.assert(fc.property(
        // Generate steps that have at least one required field
        arbSteps().filter((steps) => steps.some((s) => s.fields.some((f) => f.required))), (steps) => {
            // Build state where every required field is null (invalid)
            const wizardState = steps.map((step) => ({
                stepIndex: step.stepIndex,
                fields: Object.fromEntries(step.fields.map((f) => [f.fieldId, null])),
            }));
            const errors = validateAllSteps(steps, wizardState);
            // Collect all required field IDs
            const requiredFieldIds = new Set();
            for (const step of steps) {
                for (const field of step.fields) {
                    if (field.required)
                        requiredFieldIds.add(field.fieldId);
                }
            }
            // Every required field should have an error
            const errorFieldIds = new Set(errors.map((e) => e.fieldId));
            for (const id of requiredFieldIds) {
                expect(errorFieldIds.has(id)).toBe(true);
            }
            // Every error has a non-empty message
            for (const error of errors) {
                expect(error.message.length).toBeGreaterThan(0);
            }
        }), { numRuns: 100 });
    });
});
// ── Property 9: Cross-Step Validation Navigates to First Error ──
describe('Feature: recipe-library, Property 9: Cross-Step Validation Navigates to First Error', () => {
    /**
     * **Validates: Requirements 4.4**
     *
     * For any wizard configuration with validation errors distributed across
     * multiple steps, the cross-step validation should identify the step with
     * the lowest index that contains an error.
     */
    it('findFirstErrorStep returns the lowest stepIndex with an error', () => {
        fc.assert(fc.property(
        // Generate steps where at least one step has a required field
        arbSteps()
            .filter((steps) => steps.some((s) => s.fields.some((f) => f.required)))
            .chain((steps) => {
            // Pick a random non-empty subset of steps that have required fields
            const stepsWithRequired = steps.filter((s) => s.fields.some((f) => f.required));
            return fc
                .subarray(stepsWithRequired, {
                minLength: 1,
                maxLength: stepsWithRequired.length,
            })
                .chain((invalidSteps) => {
                const invalidIndices = new Set(invalidSteps.map((s) => s.stepIndex));
                return buildStateWithInvalidRequiredFields(steps, invalidIndices).map((state) => ({
                    steps,
                    state,
                    expectedFirstError: Math.min(...invalidSteps.map((s) => s.stepIndex)),
                }));
            });
        }), ({ steps, state, expectedFirstError }) => {
            const errors = validateAllSteps(steps, state);
            const firstError = findFirstErrorStep(errors);
            expect(firstError).not.toBeNull();
            expect(firstError).toBe(expectedFirstError);
        }), { numRuns: 100 });
    });
});
// ── Property 16: Publish Enabled Only When All Required Fields Valid ──
describe('Feature: recipe-library, Property 16: Publish Enabled Only When All Required Fields Valid', () => {
    /**
     * **Validates: Requirements 3.4**
     *
     * For any wizard configuration, the publish action should be enabled if and
     * only if every required field across all steps passes validation.
     */
    it('isPublishEnabled is true iff all required fields pass validation', () => {
        fc.assert(fc.property(arbSteps().chain((steps) => fc.boolean().chain((makeAllValid) => {
            if (makeAllValid) {
                // All valid state
                return buildValidState(steps).map((state) => ({
                    steps,
                    state,
                }));
            }
            else {
                // Possibly invalid state: set all required fields to null
                const state = steps.map((step) => ({
                    stepIndex: step.stepIndex,
                    fields: Object.fromEntries(step.fields.map((f) => [f.fieldId, null])),
                }));
                return fc.constant({ steps, state });
            }
        })), ({ steps, state }) => {
            const errors = validateAllSteps(steps, state);
            const enabled = isPublishEnabled(steps, state);
            if (errors.length === 0) {
                expect(enabled).toBe(true);
            }
            else {
                expect(enabled).toBe(false);
            }
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=validation.property.test.js.map
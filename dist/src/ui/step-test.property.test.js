import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { isStepTestable, buildStepTestButtonViewModel, initialStepTestState, } from './step-test.js';
// ── Generators ──
const arbFieldType = fc.constantFrom('text', 'select', 'number', 'boolean', 'connection');
function arbFieldDefinition(index, connectedSystem) {
    return fc
        .tuple(fc.string({ minLength: 1, maxLength: 20 }), arbFieldType, fc.boolean(), fc.string({ minLength: 1, maxLength: 40 }))
        .map(([label, type, required, helpText]) => ({
        fieldId: `field-${index}`,
        label,
        type,
        required,
        helpText,
        validation: {},
        connectedSystem,
    }));
}
/**
 * Generates a step where NO field has a connected system.
 */
function arbStepWithoutConnectedSystem() {
    return fc
        .integer({ min: 1, max: 5 })
        .chain((fieldCount) => {
        const fieldArbs = Array.from({ length: fieldCount }, (_, i) => arbFieldDefinition(i, null));
        return fc.tuple(fc.integer({ min: 0, max: 20 }), fc.string({ minLength: 1, maxLength: 30 }), fc.string({ minLength: 1, maxLength: 50 }), fc.tuple(...fieldArbs));
    })
        .map(([stepIndex, title, helpText, fields]) => ({
        stepIndex,
        title,
        helpText,
        fields,
    }));
}
/**
 * Generates a step where AT LEAST ONE field has a non-null connected system.
 */
function arbStepWithConnectedSystem() {
    return fc
        .tuple(fc.integer({ min: 0, max: 4 }), // fields before the connected one
    fc.integer({ min: 0, max: 4 }))
        .chain(([before, after]) => {
        const beforeArbs = Array.from({ length: before }, (_, i) => arbFieldDefinition(i, null));
        const connectedField = arbFieldDefinition(before, null).chain((f) => fc.string({ minLength: 1, maxLength: 20 }).map((sys) => ({
            ...f,
            connectedSystem: sys,
        })));
        const afterArbs = Array.from({ length: after }, (_, i) => fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }).chain((cs) => arbFieldDefinition(before + 1 + i, cs)));
        return fc.tuple(fc.integer({ min: 0, max: 20 }), fc.string({ minLength: 1, maxLength: 30 }), fc.string({ minLength: 1, maxLength: 50 }), fc.tuple(...beforeArbs), connectedField, fc.tuple(...afterArbs));
    })
        .map(([stepIndex, title, helpText, beforeFields, connField, afterFields]) => ({
        stepIndex,
        title,
        helpText,
        fields: [...beforeFields, connField, ...afterFields],
    }));
}
/**
 * Generates an arbitrary step that may or may not have connected systems.
 */
function arbStep() {
    return fc.oneof(arbStepWithConnectedSystem(), arbStepWithoutConnectedSystem());
}
// ── Property 10: Test Button Presence Matches Connected System ──
describe('Feature: recipe-library, Property 10: Test Button Presence Matches Connected System', () => {
    /**
     * **Validates: Requirements 5.1**
     *
     * For any wizard step, the "Test this step" action should be available
     * if and only if the step references at least one connected system.
     */
    it('test button is visible iff step has at least one connected system field', () => {
        fc.assert(fc.property(arbStep(), (step) => {
            const hasConnectedSystem = step.fields.some((f) => f.connectedSystem !== null);
            const testable = isStepTestable(step);
            const vm = buildStepTestButtonViewModel(step, initialStepTestState());
            // isStepTestable matches the ground truth
            expect(testable).toBe(hasConnectedSystem);
            // View model visibility matches
            expect(vm.visible).toBe(hasConnectedSystem);
            // When visible and idle, canSubmit should be true
            if (hasConnectedSystem) {
                expect(vm.canSubmit).toBe(true);
            }
            else {
                expect(vm.canSubmit).toBe(false);
            }
        }), { numRuns: 200 });
    });
    it('step with connected system is always testable', () => {
        fc.assert(fc.property(arbStepWithConnectedSystem(), (step) => {
            expect(isStepTestable(step)).toBe(true);
            const vm = buildStepTestButtonViewModel(step, initialStepTestState());
            expect(vm.visible).toBe(true);
        }), { numRuns: 100 });
    });
    it('step without connected system is never testable', () => {
        fc.assert(fc.property(arbStepWithoutConnectedSystem(), (step) => {
            expect(isStepTestable(step)).toBe(false);
            const vm = buildStepTestButtonViewModel(step, initialStepTestState());
            expect(vm.visible).toBe(false);
            expect(vm.canSubmit).toBe(false);
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=step-test.property.test.js.map
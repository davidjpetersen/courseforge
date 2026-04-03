/**
 * Step Test — View model and visibility logic.
 *
 * Pure TypeScript (no React, no DOM).
 */
export function initialStepTestState() {
    return { loading: false, result: null, details: null, suggestedFix: null };
}
/**
 * Builds the view model for the step test button.
 * `visible` is true only when the step references at least one connected system.
 * `canSubmit` is false while a test is in progress (prevents duplicate submissions).
 */
export function buildStepTestButtonViewModel(step, testState) {
    const visible = isStepTestable(step);
    return {
        visible,
        loading: testState.loading,
        result: testState.result,
        details: testState.details,
        suggestedFix: testState.suggestedFix,
        canSubmit: visible && !testState.loading,
    };
}
// ── 9.3 Test Button Visibility Logic ──
/**
 * Returns true if any field in the step has a non-null connectedSystem.
 */
export function isStepTestable(step) {
    return step.fields.some((f) => f.connectedSystem !== null);
}
//# sourceMappingURL=step-test.js.map
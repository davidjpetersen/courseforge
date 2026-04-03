/**
 * Step Test — View model and visibility logic.
 *
 * Pure TypeScript (no React, no DOM).
 */
import type { StepDefinition } from '../models/types.js';
export interface StepTestState {
    loading: boolean;
    result: 'pass' | 'fail' | null;
    details: string | null;
    suggestedFix: string | null;
}
export declare function initialStepTestState(): StepTestState;
export interface StepTestButtonViewModel {
    visible: boolean;
    loading: boolean;
    result: 'pass' | 'fail' | null;
    details: string | null;
    suggestedFix: string | null;
    canSubmit: boolean;
}
/**
 * Builds the view model for the step test button.
 * `visible` is true only when the step references at least one connected system.
 * `canSubmit` is false while a test is in progress (prevents duplicate submissions).
 */
export declare function buildStepTestButtonViewModel(step: StepDefinition, testState: StepTestState): StepTestButtonViewModel;
/**
 * Returns true if any field in the step has a non-null connectedSystem.
 */
export declare function isStepTestable(step: StepDefinition): boolean;
//# sourceMappingURL=step-test.d.ts.map
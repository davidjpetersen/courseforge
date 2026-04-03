/**
 * Wizard Validation — Per-step, cross-step, and publish-enabled logic.
 *
 * Pure TypeScript functions (no React, no DOM).
 */
import type { FieldDefinition, FieldValue, StepDefinition } from '../models/types.js';
import type { WizardStepState } from './wizard.js';
export interface FieldError {
    fieldId: string;
    stepIndex: number;
    message: string;
}
export interface ValidationSummaryViewModel {
    errors: FieldError[];
    firstErrorStepIndex: number | null;
    hasErrors: boolean;
    errorCountByStep: Record<number, number>;
}
/**
 * Validates a single field value against its definition.
 * Returns an error message string, or null if valid.
 */
export declare function validateField(field: FieldDefinition, value: FieldValue): string | null;
/**
 * Validates all fields in a single step.
 * Returns an array of FieldError for each invalid field.
 */
export declare function validateStep(step: StepDefinition, fieldValues: Record<string, FieldValue>): FieldError[];
/**
 * Validates all steps, returns all errors across all steps.
 */
export declare function validateAllSteps(steps: StepDefinition[], wizardState: WizardStepState[]): FieldError[];
/**
 * Returns the lowest stepIndex that has an error, or null if no errors.
 */
export declare function findFirstErrorStep(errors: FieldError[]): number | null;
/**
 * Builds a ValidationSummaryViewModel from a list of errors.
 */
export declare function buildValidationSummary(errors: FieldError[]): ValidationSummaryViewModel;
/**
 * Returns true only when every required field across all steps passes validation.
 */
export declare function isPublishEnabled(steps: StepDefinition[], wizardState: WizardStepState[]): boolean;
//# sourceMappingURL=validation.d.ts.map
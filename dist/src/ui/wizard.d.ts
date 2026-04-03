/**
 * Recipe Wizard — Core Navigation & State Management.
 *
 * Pure TypeScript state machine for multi-step wizard:
 * - Create wizard state from a template
 * - Navigate forward/backward/to-step with data preservation
 * - Progress indicator
 * - Build step view models with field values and help text
 * - Session storage persistence
 */
import type { Template, StepDefinition, FieldValue } from '../models/types.js';
import type { Storage } from './filter.js';
export interface WizardStepState {
    stepIndex: number;
    fields: Record<string, FieldValue>;
    testResult?: 'pass' | 'fail' | null;
}
export interface WizardState {
    templateId: string;
    currentStepIndex: number;
    totalSteps: number;
    steps: WizardStepState[];
}
export interface ProgressIndicator {
    currentStep: number;
    totalSteps: number;
}
export interface WizardFieldViewModel {
    fieldId: string;
    label: string;
    type: string;
    required: boolean;
    helpText: string;
    value: FieldValue;
    connectedSystem: string | null;
}
export interface WizardStepViewModel {
    stepIndex: number;
    title: string;
    helpText: string;
    fields: WizardFieldViewModel[];
}
/**
 * Creates initial wizard state from a template definition.
 * Each step gets an empty field map keyed by fieldId.
 */
export declare function createWizardState(template: Template): WizardState;
/**
 * Returns the progress indicator for the current wizard state.
 * currentStep is 1-based (human-friendly).
 */
export declare function getProgressIndicator(state: WizardState): ProgressIndicator;
export declare function canGoNext(state: WizardState): boolean;
export declare function canGoPrevious(state: WizardState): boolean;
/**
 * Publish is enabled when there is at least one step
 * (validation is handled separately in Task 8).
 */
export declare function canPublish(state: WizardState): boolean;
export declare function goToNextStep(state: WizardState): WizardState;
export declare function goToPreviousStep(state: WizardState): WizardState;
export declare function goToStep(state: WizardState, stepIndex: number): WizardState;
/**
 * Sets a field value on a specific step, preserving all other data.
 */
export declare function setFieldValue(state: WizardState, stepIndex: number, fieldId: string, value: FieldValue): WizardState;
/**
 * Builds a view model for a single wizard step, combining the step
 * definition (schema) with the current field values.
 */
export declare function buildStepViewModel(step: StepDefinition, fieldValues: Record<string, FieldValue>): WizardStepViewModel;
/**
 * Returns the view model for the current step of the wizard.
 * Requires the template's step definitions to build the view.
 */
export declare function getCurrentStep(state: WizardState, templateSteps: StepDefinition[]): WizardStepViewModel;
export declare function saveWizardState(storage: Storage, state: WizardState): void;
export declare function loadWizardState(storage: Storage): WizardState | null;
export declare function clearWizardState(storage: Storage): void;
//# sourceMappingURL=wizard.d.ts.map
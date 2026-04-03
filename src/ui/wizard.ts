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

import type {
  Template,
  StepDefinition,
  FieldDefinition,
  FieldValue,
} from '../models/types.js';
import type { Storage } from './filter.js';

// ── Wizard State Types ──

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
  currentStep: number; // 1-based
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

// ── 7.1 RecipeWizard — State Creation & Navigation ──

/**
 * Creates initial wizard state from a template definition.
 * Each step gets an empty field map keyed by fieldId.
 */
export function createWizardState(template: Template): WizardState {
  return {
    templateId: template.templateId,
    currentStepIndex: 0,
    totalSteps: template.steps.length,
    steps: template.steps.map((step) => ({
      stepIndex: step.stepIndex,
      fields: Object.fromEntries(step.fields.map((f) => [f.fieldId, null])),
    })),
  };
}

/**
 * Returns the progress indicator for the current wizard state.
 * currentStep is 1-based (human-friendly).
 */
export function getProgressIndicator(state: WizardState): ProgressIndicator {
  return {
    currentStep: state.currentStepIndex + 1,
    totalSteps: state.totalSteps,
  };
}

export function canGoNext(state: WizardState): boolean {
  return state.currentStepIndex < state.totalSteps - 1;
}

export function canGoPrevious(state: WizardState): boolean {
  return state.currentStepIndex > 0;
}

/**
 * Publish is enabled when there is at least one step
 * (validation is handled separately in Task 8).
 */
export function canPublish(state: WizardState): boolean {
  return state.totalSteps > 0;
}

// ── 7.4 Navigation with Data Preservation ──

export function goToNextStep(state: WizardState): WizardState {
  if (!canGoNext(state)) return state;
  return { ...state, currentStepIndex: state.currentStepIndex + 1 };
}

export function goToPreviousStep(state: WizardState): WizardState {
  if (!canGoPrevious(state)) return state;
  return { ...state, currentStepIndex: state.currentStepIndex - 1 };
}

export function goToStep(state: WizardState, stepIndex: number): WizardState {
  if (stepIndex < 0 || stepIndex >= state.totalSteps) return state;
  return { ...state, currentStepIndex: stepIndex };
}

/**
 * Sets a field value on a specific step, preserving all other data.
 */
export function setFieldValue(
  state: WizardState,
  stepIndex: number,
  fieldId: string,
  value: FieldValue,
): WizardState {
  if (stepIndex < 0 || stepIndex >= state.totalSteps) return state;
  return {
    ...state,
    steps: state.steps.map((s) =>
      s.stepIndex === stepIndex
        ? { ...s, fields: { ...s.fields, [fieldId]: value } }
        : s,
    ),
  };
}

// ── 7.2 WizardStep — Step View Model Builder ──

/**
 * Builds a view model for a single wizard step, combining the step
 * definition (schema) with the current field values.
 */
export function buildStepViewModel(
  step: StepDefinition,
  fieldValues: Record<string, FieldValue>,
): WizardStepViewModel {
  return {
    stepIndex: step.stepIndex,
    title: step.title,
    helpText: step.helpText,
    fields: step.fields.map((f) => ({
      fieldId: f.fieldId,
      label: f.label,
      type: f.type,
      required: f.required,
      helpText: f.helpText,
      value: fieldValues[f.fieldId] ?? null,
      connectedSystem: f.connectedSystem,
    })),
  };
}

/**
 * Returns the view model for the current step of the wizard.
 * Requires the template's step definitions to build the view.
 */
export function getCurrentStep(
  state: WizardState,
  templateSteps: StepDefinition[],
): WizardStepViewModel {
  const stepDef = templateSteps[state.currentStepIndex]!;
  const stepState = state.steps[state.currentStepIndex]!;
  return buildStepViewModel(stepDef, stepState.fields);
}

// ── 7.3 Session Storage Persistence ──

const WIZARD_STORAGE_KEY = 'recipe-library:wizard';

export function saveWizardState(storage: Storage, state: WizardState): void {
  storage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(state));
}

export function loadWizardState(storage: Storage): WizardState | null {
  const raw = storage.getItem(WIZARD_STORAGE_KEY);
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValidWizardState(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearWizardState(storage: Storage): void {
  storage.removeItem(WIZARD_STORAGE_KEY);
}

function isValidWizardState(value: unknown): value is WizardState {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.templateId === 'string' &&
    typeof obj.currentStepIndex === 'number' &&
    typeof obj.totalSteps === 'number' &&
    Array.isArray(obj.steps)
  );
}

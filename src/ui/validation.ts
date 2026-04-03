/**
 * Wizard Validation — Per-step, cross-step, and publish-enabled logic.
 *
 * Pure TypeScript functions (no React, no DOM).
 */

import type {
  FieldDefinition,
  FieldValue,
  StepDefinition,
  FieldType,
} from '../models/types.js';
import type { WizardStepState } from './wizard.js';

// ── Types ──

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

// ── 8.1 Per-Step Field Validation ──

/**
 * Validates a single field value against its definition.
 * Returns an error message string, or null if valid.
 */
export function validateField(
  field: FieldDefinition,
  value: FieldValue,
): string | null {
  // Type validation first (if value is non-null)
  if (value !== null && value !== undefined) {
    const typeError = validateType(field.type, value);
    if (typeError) return typeError;
  }

  // Required check
  if (field.required) {
    if (value === null || value === undefined) {
      return `${field.label} is required`;
    }
    if (typeof value === 'string' && value.trim() === '') {
      return `${field.label} is required`;
    }
  }

  // Skip further validation for null/undefined optional fields
  if (value === null || value === undefined) return null;

  // Pattern validation (strings only)
  if (field.validation.pattern && typeof value === 'string') {
    const regex = new RegExp(field.validation.pattern);
    if (!regex.test(value)) {
      return `${field.label} does not match the required format`;
    }
  }

  // Min/Max for numbers
  if (typeof value === 'number') {
    if (field.validation.min !== undefined && value < field.validation.min) {
      return `${field.label} must be at least ${field.validation.min}`;
    }
    if (field.validation.max !== undefined && value > field.validation.max) {
      return `${field.label} must be at most ${field.validation.max}`;
    }
  }

  // Min/Max for strings (length)
  if (typeof value === 'string') {
    if (
      field.validation.min !== undefined &&
      value.length < field.validation.min
    ) {
      return `${field.label} must be at least ${field.validation.min} characters`;
    }
    if (
      field.validation.max !== undefined &&
      value.length > field.validation.max
    ) {
      return `${field.label} must be at most ${field.validation.max} characters`;
    }
  }

  return null;
}


/**
 * Checks that the runtime value type matches the expected field type.
 */
function validateType(fieldType: FieldType, value: FieldValue): string | null {
  if (value === null || value === undefined) return null;

  switch (fieldType) {
    case 'text':
    case 'select':
    case 'connection':
      if (typeof value !== 'string') return `Expected a text value`;
      break;
    case 'number':
      if (typeof value !== 'number') return `Expected a numeric value`;
      break;
    case 'boolean':
      if (typeof value !== 'boolean') return `Expected a boolean value`;
      break;
  }
  return null;
}

/**
 * Validates all fields in a single step.
 * Returns an array of FieldError for each invalid field.
 */
export function validateStep(
  step: StepDefinition,
  fieldValues: Record<string, FieldValue>,
): FieldError[] {
  const errors: FieldError[] = [];
  for (const field of step.fields) {
    const value = fieldValues[field.fieldId] ?? null;
    const message = validateField(field, value);
    if (message) {
      errors.push({
        fieldId: field.fieldId,
        stepIndex: step.stepIndex,
        message,
      });
    }
  }
  return errors;
}

// ── 8.2 Cross-Step Validation ──

/**
 * Validates all steps, returns all errors across all steps.
 */
export function validateAllSteps(
  steps: StepDefinition[],
  wizardState: WizardStepState[],
): FieldError[] {
  const errors: FieldError[] = [];
  for (const step of steps) {
    const stepState = wizardState.find((s) => s.stepIndex === step.stepIndex);
    const fieldValues = stepState?.fields ?? {};
    errors.push(...validateStep(step, fieldValues));
  }
  return errors;
}

// ── 8.3 First-Error-Step Navigation ──

/**
 * Returns the lowest stepIndex that has an error, or null if no errors.
 */
export function findFirstErrorStep(errors: FieldError[]): number | null {
  if (errors.length === 0) return null;
  return Math.min(...errors.map((e) => e.stepIndex));
}

// ── 8.4 ValidationSummary View Model ──

/**
 * Builds a ValidationSummaryViewModel from a list of errors.
 */
export function buildValidationSummary(
  errors: FieldError[],
): ValidationSummaryViewModel {
  const errorCountByStep: Record<number, number> = {};
  for (const error of errors) {
    errorCountByStep[error.stepIndex] =
      (errorCountByStep[error.stepIndex] ?? 0) + 1;
  }
  return {
    errors,
    firstErrorStepIndex: findFirstErrorStep(errors),
    hasErrors: errors.length > 0,
    errorCountByStep,
  };
}

// ── 8.7 Publish Enabled Logic ──

/**
 * Returns true only when every required field across all steps passes validation.
 */
export function isPublishEnabled(
  steps: StepDefinition[],
  wizardState: WizardStepState[],
): boolean {
  const errors = validateAllSteps(steps, wizardState);
  return errors.length === 0;
}

import { describe, it, expect } from 'vitest';
import type { FieldDefinition, StepDefinition } from '../models/types';
import type { WizardStepState } from './wizard';
import {
  validateField,
  validateStep,
  validateAllSteps,
  findFirstErrorStep,
  buildValidationSummary,
  isPublishEnabled,
} from './validation';

// ── Helpers ──

function textField(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    fieldId: 'f1',
    label: 'Name',
    type: 'text',
    required: true,
    helpText: '',
    validation: {},
    connectedSystem: null,
    ...overrides,
  };
}

function numField(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    fieldId: 'f2',
    label: 'Count',
    type: 'number',
    required: false,
    helpText: '',
    validation: {},
    connectedSystem: null,
    ...overrides,
  };
}

function makeStep(
  stepIndex: number,
  fields: FieldDefinition[],
): StepDefinition {
  return { stepIndex, title: `Step ${stepIndex}`, helpText: '', fields };
}

function makeStepState(
  stepIndex: number,
  fields: Record<string, any>,
): WizardStepState {
  return { stepIndex, fields };
}

// ── validateField — required check ──

describe('validateField — required check', () => {
  it('returns error for null on required field', () => {
    expect(validateField(textField(), null)).toBe('Name is required');
  });

  it('returns error for empty string on required field', () => {
    expect(validateField(textField(), '')).toBe('Name is required');
  });

  it('returns error for whitespace-only string on required field', () => {
    expect(validateField(textField(), '   ')).toBe('Name is required');
    expect(validateField(textField(), '\t\n')).toBe('Name is required');
  });

  it('passes for non-empty string on required field', () => {
    expect(validateField(textField(), 'hello')).toBeNull();
  });

  it('passes for null on optional field', () => {
    expect(validateField(textField({ required: false }), null)).toBeNull();
  });
});

// ── validateField — type validation ──

describe('validateField — type validation', () => {
  it('rejects number value for text field', () => {
    expect(validateField(textField(), 42)).toBe('Expected a text value');
  });

  it('rejects string value for number field', () => {
    expect(validateField(numField({ required: true }), 'abc')).toBe(
      'Expected a numeric value',
    );
  });

  it('rejects number value for boolean field', () => {
    const f = textField({ type: 'boolean', required: false });
    expect(validateField(f, 99)).toBe('Expected a boolean value');
  });

  it('accepts string for select field', () => {
    const f = textField({ type: 'select', required: false });
    expect(validateField(f, 'option1')).toBeNull();
  });

  it('accepts string for connection field', () => {
    const f = textField({ type: 'connection', required: false });
    expect(validateField(f, 'Canvas LMS')).toBeNull();
  });
});

// ── validateField — pattern matching ──

describe('validateField — pattern matching', () => {
  it('rejects value that does not match pattern', () => {
    const f = textField({ validation: { pattern: '^[A-Z]+$' } });
    expect(validateField(f, 'abc')).toBe(
      'Name does not match the required format',
    );
  });

  it('passes value that matches pattern', () => {
    const f = textField({ validation: { pattern: '^[A-Z]+$' } });
    expect(validateField(f, 'ABC')).toBeNull();
  });

  it('skips pattern check for non-string values', () => {
    const f = numField({ validation: { pattern: '^\\d+$', min: 0 } });
    expect(validateField(f, 5)).toBeNull();
  });
});

// ── validateField — min/max for numbers ──

describe('validateField — min/max for numbers', () => {
  it('rejects number below min', () => {
    const f = numField({ validation: { min: 10 } });
    expect(validateField(f, 5)).toBe('Count must be at least 10');
  });

  it('rejects number above max', () => {
    const f = numField({ validation: { max: 100 } });
    expect(validateField(f, 200)).toBe('Count must be at most 100');
  });

  it('passes number at boundary', () => {
    const f = numField({ validation: { min: 0, max: 100 } });
    expect(validateField(f, 0)).toBeNull();
    expect(validateField(f, 100)).toBeNull();
  });
});

// ── validateField — min/max for strings (length) ──

describe('validateField — min/max for strings (length)', () => {
  it('rejects string shorter than min', () => {
    const f = textField({ validation: { min: 3 } });
    expect(validateField(f, 'ab')).toBe('Name must be at least 3 characters');
  });

  it('rejects string longer than max', () => {
    const f = textField({ validation: { max: 5 } });
    expect(validateField(f, 'abcdef')).toBe(
      'Name must be at most 5 characters',
    );
  });

  it('passes string at boundary length', () => {
    const f = textField({ validation: { min: 2, max: 4 } });
    expect(validateField(f, 'ab')).toBeNull();
    expect(validateField(f, 'abcd')).toBeNull();
  });
});

// ── validateStep ──

describe('validateStep', () => {
  it('returns errors for all invalid fields in a step', () => {
    const step = makeStep(0, [
      textField({ fieldId: 'a', label: 'A' }),
      textField({ fieldId: 'b', label: 'B' }),
    ]);
    const errors = validateStep(step, { a: null, b: '' });
    expect(errors).toHaveLength(2);
    expect(errors[0]!.fieldId).toBe('a');
    expect(errors[1]!.fieldId).toBe('b');
    expect(errors[0]!.stepIndex).toBe(0);
  });

  it('returns empty array when all fields valid', () => {
    const step = makeStep(0, [textField({ fieldId: 'a' })]);
    const errors = validateStep(step, { a: 'valid' });
    expect(errors).toHaveLength(0);
  });

  it('treats missing field values as null', () => {
    const step = makeStep(0, [textField({ fieldId: 'a', label: 'A' })]);
    const errors = validateStep(step, {});
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe('A is required');
  });
});

// ── validateAllSteps (cross-step) ──

describe('validateAllSteps', () => {
  it('collects errors across multiple steps', () => {
    const steps = [
      makeStep(0, [textField({ fieldId: 'a', label: 'A' })]),
      makeStep(1, [textField({ fieldId: 'b', label: 'B' })]),
    ];
    const state: WizardStepState[] = [
      makeStepState(0, { a: null }),
      makeStepState(1, { b: '' }),
    ];
    const errors = validateAllSteps(steps, state);
    expect(errors).toHaveLength(2);
    expect(errors[0]!.stepIndex).toBe(0);
    expect(errors[1]!.stepIndex).toBe(1);
  });

  it('returns empty when all steps valid', () => {
    const steps = [makeStep(0, [textField({ fieldId: 'a' })])];
    const state: WizardStepState[] = [makeStepState(0, { a: 'ok' })];
    expect(validateAllSteps(steps, state)).toHaveLength(0);
  });
});

// ── findFirstErrorStep ──

describe('findFirstErrorStep', () => {
  it('returns lowest stepIndex with error', () => {
    const errors = [
      { fieldId: 'b', stepIndex: 2, message: 'err' },
      { fieldId: 'a', stepIndex: 0, message: 'err' },
    ];
    expect(findFirstErrorStep(errors)).toBe(0);
  });

  it('returns null for empty errors', () => {
    expect(findFirstErrorStep([])).toBeNull();
  });
});

// ── buildValidationSummary ──

describe('buildValidationSummary', () => {
  it('builds summary with error counts by step', () => {
    const errors = [
      { fieldId: 'a', stepIndex: 0, message: 'err1' },
      { fieldId: 'b', stepIndex: 0, message: 'err2' },
      { fieldId: 'c', stepIndex: 2, message: 'err3' },
    ];
    const summary = buildValidationSummary(errors);
    expect(summary.hasErrors).toBe(true);
    expect(summary.firstErrorStepIndex).toBe(0);
    expect(summary.errorCountByStep).toEqual({ 0: 2, 2: 1 });
    expect(summary.errors).toHaveLength(3);
  });

  it('builds empty summary when no errors', () => {
    const summary = buildValidationSummary([]);
    expect(summary.hasErrors).toBe(false);
    expect(summary.firstErrorStepIndex).toBeNull();
    expect(summary.errorCountByStep).toEqual({});
  });
});

// ── isPublishEnabled ──

describe('isPublishEnabled', () => {
  it('returns true when all required fields are valid', () => {
    const steps = [makeStep(0, [textField({ fieldId: 'a' })])];
    const state = [makeStepState(0, { a: 'valid' })];
    expect(isPublishEnabled(steps, state)).toBe(true);
  });

  it('returns false when any required field is invalid', () => {
    const steps = [
      makeStep(0, [textField({ fieldId: 'a' })]),
      makeStep(1, [textField({ fieldId: 'b', label: 'B' })]),
    ];
    const state = [
      makeStepState(0, { a: 'ok' }),
      makeStepState(1, { b: null }),
    ];
    expect(isPublishEnabled(steps, state)).toBe(false);
  });

  it('returns true when no steps exist', () => {
    expect(isPublishEnabled([], [])).toBe(true);
  });
});

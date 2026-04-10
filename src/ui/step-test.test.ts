import { describe, it, expect } from 'vitest';
import type { StepDefinition } from '../models/types';
import {
  isStepTestable,
  buildStepTestButtonViewModel,
  initialStepTestState,
  type StepTestState,
} from './step-test';

// ── Helpers ──

function makeStep(overrides: Partial<StepDefinition> = {}): StepDefinition {
  return {
    stepIndex: 0,
    title: 'Configure Connection',
    helpText: 'Set up your LMS connection',
    fields: [
      {
        fieldId: 'url',
        label: 'LMS URL',
        type: 'connection',
        required: true,
        helpText: 'Enter the LMS URL',
        validation: {},
        connectedSystem: 'Canvas LMS',
      },
    ],
    ...overrides,
  };
}

function makeStepWithoutConnection(): StepDefinition {
  return {
    stepIndex: 0,
    title: 'Basic Info',
    helpText: 'Enter basic information',
    fields: [
      {
        fieldId: 'name',
        label: 'Workflow Name',
        type: 'text',
        required: true,
        helpText: 'Enter a name',
        validation: {},
        connectedSystem: null,
      },
    ],
  };
}

// ── isStepTestable ──

describe('isStepTestable', () => {
  it('returns true when a field has a connected system', () => {
    expect(isStepTestable(makeStep())).toBe(true);
  });

  it('returns false when no field has a connected system', () => {
    expect(isStepTestable(makeStepWithoutConnection())).toBe(false);
  });

  it('returns true when at least one of multiple fields has a connected system', () => {
    const step = makeStep({
      fields: [
        {
          fieldId: 'name',
          label: 'Name',
          type: 'text',
          required: true,
          helpText: '',
          validation: {},
          connectedSystem: null,
        },
        {
          fieldId: 'lms',
          label: 'LMS',
          type: 'connection',
          required: true,
          helpText: '',
          validation: {},
          connectedSystem: 'Canvas LMS',
        },
      ],
    });
    expect(isStepTestable(step)).toBe(true);
  });

  it('returns false for step with empty fields array', () => {
    const step = makeStep({ fields: [] });
    expect(isStepTestable(step)).toBe(false);
  });
});

// ── buildStepTestButtonViewModel ──

describe('buildStepTestButtonViewModel', () => {
  it('returns visible=true and canSubmit=true for testable step in idle state', () => {
    const vm = buildStepTestButtonViewModel(makeStep(), initialStepTestState());
    expect(vm.visible).toBe(true);
    expect(vm.canSubmit).toBe(true);
    expect(vm.loading).toBe(false);
    expect(vm.result).toBeNull();
    expect(vm.details).toBeNull();
    expect(vm.suggestedFix).toBeNull();
  });

  it('returns visible=false and canSubmit=false for non-testable step', () => {
    const vm = buildStepTestButtonViewModel(
      makeStepWithoutConnection(),
      initialStepTestState(),
    );
    expect(vm.visible).toBe(false);
    expect(vm.canSubmit).toBe(false);
  });

  // ── Loading state (duplicate submission prevention) ──

  it('disables submit while loading (prevents duplicate submissions)', () => {
    const loadingState: StepTestState = {
      loading: true,
      result: null,
      details: null,
      suggestedFix: null,
    };
    const vm = buildStepTestButtonViewModel(makeStep(), loadingState);
    expect(vm.visible).toBe(true);
    expect(vm.loading).toBe(true);
    expect(vm.canSubmit).toBe(false);
  });

  // ── Pass display ──

  it('displays pass result', () => {
    const passState: StepTestState = {
      loading: false,
      result: 'pass',
      details: 'All checks passed',
      suggestedFix: null,
    };
    const vm = buildStepTestButtonViewModel(makeStep(), passState);
    expect(vm.result).toBe('pass');
    expect(vm.details).toBe('All checks passed');
    expect(vm.suggestedFix).toBeNull();
    expect(vm.canSubmit).toBe(true);
  });

  // ── Failure display ──

  it('displays failure result with suggested fix', () => {
    const failState: StepTestState = {
      loading: false,
      result: 'fail',
      details: 'Authentication failed',
      suggestedFix: 'Check your API key',
    };
    const vm = buildStepTestButtonViewModel(makeStep(), failState);
    expect(vm.result).toBe('fail');
    expect(vm.details).toBe('Authentication failed');
    expect(vm.suggestedFix).toBe('Check your API key');
    expect(vm.canSubmit).toBe(true);
  });

  it('displays failure result without suggested fix', () => {
    const failState: StepTestState = {
      loading: false,
      result: 'fail',
      details: 'Unknown error occurred',
      suggestedFix: null,
    };
    const vm = buildStepTestButtonViewModel(makeStep(), failState);
    expect(vm.result).toBe('fail');
    expect(vm.details).toBe('Unknown error occurred');
    expect(vm.suggestedFix).toBeNull();
  });

  // ── Timeout scenario ──

  it('handles timeout scenario (loading completes with failure)', () => {
    const timeoutState: StepTestState = {
      loading: false,
      result: 'fail',
      details: 'Request timed out after 30 seconds',
      suggestedFix: 'Check connected system status and try again',
    };
    const vm = buildStepTestButtonViewModel(makeStep(), timeoutState);
    expect(vm.result).toBe('fail');
    expect(vm.details).toContain('timed out');
    expect(vm.suggestedFix).toBeTruthy();
    expect(vm.canSubmit).toBe(true); // can retry after timeout
  });
});

// ── initialStepTestState ──

describe('initialStepTestState', () => {
  it('returns idle state with all nulls', () => {
    const state = initialStepTestState();
    expect(state.loading).toBe(false);
    expect(state.result).toBeNull();
    expect(state.details).toBeNull();
    expect(state.suggestedFix).toBeNull();
  });
});

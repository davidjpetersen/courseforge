import { describe, it, expect } from 'vitest';
import type { Template, StepDefinition } from '../models/types';
import type { Storage } from './filter';
import {
  createWizardState,
  getProgressIndicator,
  canGoNext,
  canGoPrevious,
  canPublish,
  goToNextStep,
  goToPreviousStep,
  goToStep,
  setFieldValue,
  buildStepViewModel,
  getCurrentStep,
  saveWizardState,
  loadWizardState,
  clearWizardState,
} from './wizard';

// ── Helpers ──

function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
}

function makeTemplate(stepCount = 3): Template {
  const steps: StepDefinition[] = Array.from({ length: stepCount }, (_, i) => ({
    stepIndex: i,
    title: `Step ${i + 1}`,
    helpText: `Help for step ${i + 1}`,
    fields: [
      {
        fieldId: `field-${i}-a`,
        label: `Field A of step ${i}`,
        type: 'text' as const,
        required: true,
        helpText: `Help for field A step ${i}`,
        validation: {},
        connectedSystem: null,
      },
      {
        fieldId: `field-${i}-b`,
        label: `Field B of step ${i}`,
        type: 'number' as const,
        required: false,
        helpText: `Help for field B step ${i}`,
        validation: { min: 0, max: 100 },
        connectedSystem: i === 1 ? 'Canvas LMS' : null,
      },
    ],
  }));

  return {
    templateId: 'tpl-wizard-test',
    name: 'Test Template',
    description: 'A template for wizard tests',
    categories: ['Roster Ops'],
    connectedSystems: ['Canvas LMS'],
    requiredParameters: [],
    timeToActivate: '5 min',
    educationStandardTags: ['OneRoster'],
    steps,
    certified: true,
    createdAt: '2024-01-01T00:00:00Z',
  };
}

// ── createWizardState ──

describe('createWizardState', () => {
  it('initializes from a template with correct step count', () => {
    const template = makeTemplate(3);
    const state = createWizardState(template);

    expect(state.templateId).toBe('tpl-wizard-test');
    expect(state.currentStepIndex).toBe(0);
    expect(state.totalSteps).toBe(3);
    expect(state.steps).toHaveLength(3);
  });

  it('initializes all field values to null', () => {
    const template = makeTemplate(2);
    const state = createWizardState(template);

    for (const step of state.steps) {
      for (const value of Object.values(step.fields)) {
        expect(value).toBeNull();
      }
    }
  });

  it('handles template with zero steps', () => {
    const template = makeTemplate(0);
    const state = createWizardState(template);

    expect(state.totalSteps).toBe(0);
    expect(state.steps).toEqual([]);
  });
});

// ── Progress Indicator ──

describe('getProgressIndicator', () => {
  it('returns 1-based current step', () => {
    const state = createWizardState(makeTemplate(3));
    const progress = getProgressIndicator(state);

    expect(progress.currentStep).toBe(1);
    expect(progress.totalSteps).toBe(3);
  });

  it('updates after navigation', () => {
    let state = createWizardState(makeTemplate(3));
    state = goToNextStep(state);
    const progress = getProgressIndicator(state);

    expect(progress.currentStep).toBe(2);
    expect(progress.totalSteps).toBe(3);
  });
});

// ── Navigation ──

describe('navigation', () => {
  it('canGoNext is true when not on last step', () => {
    const state = createWizardState(makeTemplate(3));
    expect(canGoNext(state)).toBe(true);
  });

  it('canGoNext is false on last step', () => {
    let state = createWizardState(makeTemplate(2));
    state = goToNextStep(state);
    expect(canGoNext(state)).toBe(false);
  });

  it('canGoPrevious is false on first step', () => {
    const state = createWizardState(makeTemplate(3));
    expect(canGoPrevious(state)).toBe(false);
  });

  it('canGoPrevious is true after advancing', () => {
    let state = createWizardState(makeTemplate(3));
    state = goToNextStep(state);
    expect(canGoPrevious(state)).toBe(true);
  });

  it('goToNextStep does not exceed bounds', () => {
    let state = createWizardState(makeTemplate(1));
    state = goToNextStep(state);
    expect(state.currentStepIndex).toBe(0);
  });

  it('goToPreviousStep does not go below 0', () => {
    let state = createWizardState(makeTemplate(3));
    state = goToPreviousStep(state);
    expect(state.currentStepIndex).toBe(0);
  });

  it('goToStep jumps to valid index', () => {
    let state = createWizardState(makeTemplate(5));
    state = goToStep(state, 3);
    expect(state.currentStepIndex).toBe(3);
  });

  it('goToStep ignores invalid index', () => {
    let state = createWizardState(makeTemplate(3));
    state = goToStep(state, 5);
    expect(state.currentStepIndex).toBe(0);
    state = goToStep(state, -1);
    expect(state.currentStepIndex).toBe(0);
  });
});

// ── Data Preservation ──

describe('data preservation across navigation', () => {
  it('preserves field values when navigating forward and back', () => {
    const template = makeTemplate(3);
    let state = createWizardState(template);

    // Set values on step 0
    state = setFieldValue(state, 0, 'field-0-a', 'hello');
    state = setFieldValue(state, 0, 'field-0-b', 42);

    // Navigate forward
    state = goToNextStep(state);
    state = setFieldValue(state, 1, 'field-1-a', 'world');

    // Navigate back
    state = goToPreviousStep(state);

    // Step 0 data preserved
    expect(state.steps[0]!.fields['field-0-a']).toBe('hello');
    expect(state.steps[0]!.fields['field-0-b']).toBe(42);

    // Navigate forward again — step 1 data preserved
    state = goToNextStep(state);
    expect(state.steps[1]!.fields['field-1-a']).toBe('world');
  });

  it('setFieldValue ignores invalid step index', () => {
    const state = createWizardState(makeTemplate(2));
    const updated = setFieldValue(state, 5, 'field-0-a', 'nope');
    expect(updated).toBe(state);
  });
});

// ── buildStepViewModel ──

describe('buildStepViewModel', () => {
  it('builds view model with field values and help text', () => {
    const step: StepDefinition = {
      stepIndex: 0,
      title: 'Configure',
      helpText: 'Configure your settings',
      fields: [
        {
          fieldId: 'name',
          label: 'Name',
          type: 'text',
          required: true,
          helpText: 'Enter your name',
          validation: {},
          connectedSystem: null,
        },
      ],
    };

    const vm = buildStepViewModel(step, { name: 'Alice' });

    expect(vm.title).toBe('Configure');
    expect(vm.helpText).toBe('Configure your settings');
    expect(vm.fields).toHaveLength(1);
    expect(vm.fields[0]!.fieldId).toBe('name');
    expect(vm.fields[0]!.value).toBe('Alice');
    expect(vm.fields[0]!.helpText).toBe('Enter your name');
  });

  it('defaults missing field values to null', () => {
    const step: StepDefinition = {
      stepIndex: 0,
      title: 'Step',
      helpText: '',
      fields: [
        {
          fieldId: 'x',
          label: 'X',
          type: 'number',
          required: false,
          helpText: '',
          validation: {},
          connectedSystem: null,
        },
      ],
    };

    const vm = buildStepViewModel(step, {});
    expect(vm.fields[0]!.value).toBeNull();
  });
});

// ── getCurrentStep ──

describe('getCurrentStep', () => {
  it('returns view model for the current step', () => {
    const template = makeTemplate(3);
    let state = createWizardState(template);
    state = setFieldValue(state, 0, 'field-0-a', 'test');

    const vm = getCurrentStep(state, template.steps);

    expect(vm.stepIndex).toBe(0);
    expect(vm.title).toBe('Step 1');
    expect(vm.fields[0]!.value).toBe('test');
  });
});

// ── canPublish ──

describe('canPublish', () => {
  it('returns true when wizard has steps', () => {
    const state = createWizardState(makeTemplate(2));
    expect(canPublish(state)).toBe(true);
  });

  it('returns false when wizard has no steps', () => {
    const state = createWizardState(makeTemplate(0));
    expect(canPublish(state)).toBe(false);
  });
});

// ── Session Storage Persistence ──

describe('wizard state persistence', () => {
  it('round-trips wizard state through storage', () => {
    const storage = createMockStorage();
    const template = makeTemplate(2);
    let state = createWizardState(template);
    state = setFieldValue(state, 0, 'field-0-a', 'saved');
    state = goToNextStep(state);

    saveWizardState(storage, state);
    const restored = loadWizardState(storage);

    expect(restored).not.toBeNull();
    expect(restored!.templateId).toBe(state.templateId);
    expect(restored!.currentStepIndex).toBe(1);
    expect(restored!.steps[0]!.fields['field-0-a']).toBe('saved');
  });

  it('returns null when no saved state', () => {
    const storage = createMockStorage();
    expect(loadWizardState(storage)).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    const storage = createMockStorage();
    storage.setItem('recipe-library:wizard', 'not-json');
    expect(loadWizardState(storage)).toBeNull();
  });

  it('returns null for non-object JSON', () => {
    const storage = createMockStorage();
    storage.setItem('recipe-library:wizard', '"just a string"');
    expect(loadWizardState(storage)).toBeNull();
  });

  it('returns null for object missing required fields', () => {
    const storage = createMockStorage();
    storage.setItem('recipe-library:wizard', JSON.stringify({ foo: 'bar' }));
    expect(loadWizardState(storage)).toBeNull();
  });

  it('clearWizardState removes saved state', () => {
    const storage = createMockStorage();
    const state = createWizardState(makeTemplate(1));
    saveWizardState(storage, state);
    clearWizardState(storage);
    expect(loadWizardState(storage)).toBeNull();
  });
});

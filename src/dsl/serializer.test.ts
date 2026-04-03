import { describe, it, expect } from 'vitest';
import { serializeConfig, deserializeConfig, DSLValidationError } from './serializer.js';
import type {
  WizardConfiguration,
  WorkflowDSL,
  WorkflowMetadata,
} from '../models/types.js';

// ── Fixtures ──

const minimalConfig: WizardConfiguration = {
  templateId: 'tpl-001',
  steps: [
    { stepIndex: 0, fields: { name: 'hello' } },
  ],
};

const maximalConfig: WizardConfiguration = {
  templateId: 'tpl-max-999',
  steps: [
    { stepIndex: 0, fields: { text: 'value', num: 42, flag: true, empty: null }, testResult: 'pass' },
    { stepIndex: 1, fields: { a: 'x', b: 0, c: false }, testResult: 'fail' },
    { stepIndex: 2, fields: { only: 'one' }, testResult: null },
  ],
};

const metadata: WorkflowMetadata = {
  tenantId: 'tenant-abc',
  createdBy: 'user-123',
  createdAt: '2024-06-01T00:00:00Z',
};

// ── serializeConfig ──

describe('serializeConfig', () => {
  it('serializes a minimal config', () => {
    const dsl = serializeConfig(minimalConfig, 'My Workflow', metadata);

    expect(dsl.version).toBe('1.0');
    expect(dsl.templateId).toBe('tpl-001');
    expect(dsl.name).toBe('My Workflow');
    expect(dsl.steps).toHaveLength(1);
    expect(dsl.steps[0].stepIndex).toBe(0);
    expect(dsl.steps[0].parameters).toEqual({ name: 'hello' });
    expect(dsl.metadata).toEqual(metadata);
  });

  it('serializes a maximal config with multiple steps and field types', () => {
    const dsl = serializeConfig(maximalConfig, 'Max Workflow', metadata);

    expect(dsl.steps).toHaveLength(3);
    expect(dsl.steps[0].parameters).toEqual({ text: 'value', num: 42, flag: true, empty: null });
    expect(dsl.steps[1].parameters).toEqual({ a: 'x', b: 0, c: false });
    expect(dsl.steps[2].parameters).toEqual({ only: 'one' });
  });

  it('does not include testResult in DSL steps', () => {
    const dsl = serializeConfig(maximalConfig, 'Test', metadata);
    for (const step of dsl.steps) {
      expect(step).not.toHaveProperty('testResult');
    }
  });

  it('does not mutate the original config or metadata', () => {
    const configCopy = JSON.parse(JSON.stringify(minimalConfig));
    const metaCopy = JSON.parse(JSON.stringify(metadata));
    serializeConfig(minimalConfig, 'W', metadata);
    expect(minimalConfig).toEqual(configCopy);
    expect(metadata).toEqual(metaCopy);
  });
});

// ── deserializeConfig ──

describe('deserializeConfig', () => {
  it('deserializes a valid DSL back to WizardConfiguration', () => {
    const dsl: WorkflowDSL = {
      version: '1.0',
      templateId: 'tpl-001',
      name: 'My Workflow',
      steps: [
        { stepIndex: 0, action: 'step-0', parameters: { name: 'hello' }, connectedSystem: null },
      ],
      metadata,
    };

    const config = deserializeConfig(dsl);
    expect(config.templateId).toBe('tpl-001');
    expect(config.steps).toHaveLength(1);
    expect(config.steps[0].stepIndex).toBe(0);
    expect(config.steps[0].fields).toEqual({ name: 'hello' });
  });

  it('strips DSL-only fields (action, connectedSystem) from result', () => {
    const dsl: WorkflowDSL = {
      version: '1.0',
      templateId: 'tpl-002',
      name: 'W',
      steps: [
        { stepIndex: 0, action: 'do-thing', parameters: { x: 1 }, connectedSystem: 'Canvas LMS' },
      ],
      metadata,
    };

    const config = deserializeConfig(dsl);
    const step = config.steps[0];
    expect(step).not.toHaveProperty('action');
    expect(step).not.toHaveProperty('connectedSystem');
  });
});

// ── Malformed DSL error handling ──

describe('deserializeConfig — malformed DSL', () => {
  it('throws on null input', () => {
    expect(() => deserializeConfig(null as unknown as WorkflowDSL)).toThrow(DSLValidationError);
  });

  it('throws on undefined input', () => {
    expect(() => deserializeConfig(undefined as unknown as WorkflowDSL)).toThrow(DSLValidationError);
  });

  it('throws on non-object input', () => {
    expect(() => deserializeConfig('bad' as unknown as WorkflowDSL)).toThrow(DSLValidationError);
  });

  it('throws with section "version" when version is missing', () => {
    const dsl = { templateId: 'x', name: 'n', steps: [], metadata } as unknown as WorkflowDSL;
    try {
      deserializeConfig(dsl);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DSLValidationError);
      expect((e as DSLValidationError).section).toBe('version');
    }
  });

  it('throws with section "templateId" when templateId is missing', () => {
    const dsl = { version: '1.0', name: 'n', steps: [], metadata } as unknown as WorkflowDSL;
    try {
      deserializeConfig(dsl);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DSLValidationError);
      expect((e as DSLValidationError).section).toBe('templateId');
    }
  });

  it('throws with section "name" when name is empty', () => {
    const dsl = { version: '1.0', templateId: 'x', name: '', steps: [], metadata } as unknown as WorkflowDSL;
    try {
      deserializeConfig(dsl);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DSLValidationError);
      expect((e as DSLValidationError).section).toBe('name');
    }
  });

  it('throws with section "steps" when steps is not an array', () => {
    const dsl = { version: '1.0', templateId: 'x', name: 'n', steps: 'bad', metadata } as unknown as WorkflowDSL;
    try {
      deserializeConfig(dsl);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DSLValidationError);
      expect((e as DSLValidationError).section).toBe('steps');
    }
  });

  it('throws with section "metadata" when metadata is missing', () => {
    const dsl = { version: '1.0', templateId: 'x', name: 'n', steps: [] } as unknown as WorkflowDSL;
    try {
      deserializeConfig(dsl);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DSLValidationError);
      expect((e as DSLValidationError).section).toBe('metadata');
    }
  });

  it('throws with section "metadata" when metadata is an array', () => {
    const dsl = { version: '1.0', templateId: 'x', name: 'n', steps: [], metadata: [] } as unknown as WorkflowDSL;
    try {
      deserializeConfig(dsl);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DSLValidationError);
      expect((e as DSLValidationError).section).toBe('metadata');
    }
  });

  it('throws when a step is missing stepIndex', () => {
    const dsl = {
      version: '1.0', templateId: 'x', name: 'n',
      steps: [{ action: 'a', parameters: {}, connectedSystem: null }],
      metadata,
    } as unknown as WorkflowDSL;
    try {
      deserializeConfig(dsl);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DSLValidationError);
      expect((e as DSLValidationError).section).toBe('steps[0].stepIndex');
    }
  });

  it('throws when a step has parameters as an array', () => {
    const dsl = {
      version: '1.0', templateId: 'x', name: 'n',
      steps: [{ stepIndex: 0, action: 'a', parameters: [], connectedSystem: null }],
      metadata,
    } as unknown as WorkflowDSL;
    try {
      deserializeConfig(dsl);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DSLValidationError);
      expect((e as DSLValidationError).section).toBe('steps[0].parameters');
    }
  });

  it('throws when metadata.tenantId is missing', () => {
    const dsl = {
      version: '1.0', templateId: 'x', name: 'n', steps: [],
      metadata: { createdBy: 'u', createdAt: '2024-01-01T00:00:00Z' },
    } as unknown as WorkflowDSL;
    try {
      deserializeConfig(dsl);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DSLValidationError);
      expect((e as DSLValidationError).section).toBe('metadata.tenantId');
    }
  });

  it('error message is non-empty and descriptive', () => {
    try {
      deserializeConfig({} as unknown as WorkflowDSL);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DSLValidationError);
      expect((e as DSLValidationError).message.length).toBeGreaterThan(0);
      expect((e as DSLValidationError).section.length).toBeGreaterThan(0);
    }
  });
});

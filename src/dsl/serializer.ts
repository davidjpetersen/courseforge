/**
 * DSL Serialization & Deserialization for the Recipe Library.
 *
 * Converts between WizardConfiguration (client-side state) and
 * WorkflowDSL (the persisted/published JSON representation).
 */

import type {
  WizardConfiguration,
  WizardStepConfig,
  WorkflowDSL,
  WorkflowDSLStep,
  WorkflowMetadata,
  FieldValue,
} from '../models/types.js';

// ── Serialization Error ──

export class DSLValidationError extends Error {
  constructor(
    message: string,
    public readonly section: string,
  ) {
    super(message);
    this.name = 'DSLValidationError';
  }
}

// ── Serialize ──

/**
 * Converts a WizardConfiguration into a WorkflowDSL definition.
 *
 * The `name` parameter provides the user-chosen workflow name that
 * appears in the DSL output.
 */
export function serializeConfig(
  config: WizardConfiguration,
  name: string,
  metadata: WorkflowMetadata,
): WorkflowDSL {
  const steps: WorkflowDSLStep[] = config.steps.map((step) => ({
    stepIndex: step.stepIndex,
    action: `step-${step.stepIndex}`,
    parameters: { ...step.fields },
    connectedSystem: null,
  }));

  return {
    version: '1.0',
    templateId: config.templateId,
    name,
    steps,
    metadata: { ...metadata },
  };
}

// ── Deserialize ──

/**
 * Converts a WorkflowDSL definition back into a WizardConfiguration.
 *
 * Throws `DSLValidationError` when the input is malformed, with a
 * descriptive message identifying the invalid section.
 */
export function deserializeConfig(dsl: WorkflowDSL): WizardConfiguration {
  validateDSL(dsl);

  const steps: WizardStepConfig[] = dsl.steps.map((dslStep) => ({
    stepIndex: dslStep.stepIndex,
    fields: { ...dslStep.parameters },
  }));

  return {
    templateId: dsl.templateId,
    steps,
  };
}


// ── Validation helpers ──

function validateDSL(dsl: unknown): asserts dsl is WorkflowDSL {
  if (dsl === null || dsl === undefined || typeof dsl !== 'object') {
    throw new DSLValidationError(
      'DSL must be a non-null object',
      'root',
    );
  }

  const obj = dsl as Record<string, unknown>;

  // version
  if (typeof obj.version !== 'string' || obj.version.length === 0) {
    throw new DSLValidationError(
      'Missing or invalid "version" field: expected a non-empty string',
      'version',
    );
  }

  // templateId
  if (typeof obj.templateId !== 'string' || obj.templateId.length === 0) {
    throw new DSLValidationError(
      'Missing or invalid "templateId" field: expected a non-empty string',
      'templateId',
    );
  }

  // name
  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    throw new DSLValidationError(
      'Missing or invalid "name" field: expected a non-empty string',
      'name',
    );
  }

  // steps
  if (!Array.isArray(obj.steps)) {
    throw new DSLValidationError(
      'Missing or invalid "steps" field: expected an array',
      'steps',
    );
  }

  for (let i = 0; i < obj.steps.length; i++) {
    validateDSLStep(obj.steps[i], i);
  }

  // metadata
  if (obj.metadata === null || obj.metadata === undefined || typeof obj.metadata !== 'object' || Array.isArray(obj.metadata)) {
    throw new DSLValidationError(
      'Missing or invalid "metadata" field: expected an object',
      'metadata',
    );
  }

  validateMetadata(obj.metadata as Record<string, unknown>);
}

function validateDSLStep(step: unknown, index: number): void {
  if (step === null || step === undefined || typeof step !== 'object') {
    throw new DSLValidationError(
      `Step at index ${index} must be a non-null object`,
      `steps[${index}]`,
    );
  }

  const s = step as Record<string, unknown>;

  if (typeof s.stepIndex !== 'number' || !Number.isFinite(s.stepIndex)) {
    throw new DSLValidationError(
      `Step at index ${index}: missing or invalid "stepIndex" field: expected a finite number`,
      `steps[${index}].stepIndex`,
    );
  }

  if (typeof s.action !== 'string') {
    throw new DSLValidationError(
      `Step at index ${index}: missing or invalid "action" field: expected a string`,
      `steps[${index}].action`,
    );
  }

  if (s.parameters === null || s.parameters === undefined || typeof s.parameters !== 'object' || Array.isArray(s.parameters)) {
    throw new DSLValidationError(
      `Step at index ${index}: missing or invalid "parameters" field: expected an object`,
      `steps[${index}].parameters`,
    );
  }

  // Validate parameter values are valid FieldValue types
  const params = s.parameters as Record<string, unknown>;
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new DSLValidationError(
        `Step at index ${index}: parameter "${key}" has invalid type: expected string, number, boolean, or null`,
        `steps[${index}].parameters.${key}`,
      );
    }
  }
}

function validateMetadata(meta: Record<string, unknown>): void {
  if (typeof meta.tenantId !== 'string' || meta.tenantId.length === 0) {
    throw new DSLValidationError(
      'Missing or invalid "metadata.tenantId" field: expected a non-empty string',
      'metadata.tenantId',
    );
  }

  if (typeof meta.createdBy !== 'string' || meta.createdBy.length === 0) {
    throw new DSLValidationError(
      'Missing or invalid "metadata.createdBy" field: expected a non-empty string',
      'metadata.createdBy',
    );
  }

  if (typeof meta.createdAt !== 'string' || meta.createdAt.length === 0) {
    throw new DSLValidationError(
      'Missing or invalid "metadata.createdAt" field: expected a non-empty string',
      'metadata.createdAt',
    );
  }
}

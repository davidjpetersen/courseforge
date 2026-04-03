/**
 * Core domain types for the Recipe Library.
 */

// ── Field & Step Definitions (embedded in Template) ──

export interface FieldValidation {
  pattern?: string;
  min?: number;
  max?: number;
  options?: string[];
}

export type FieldType = 'text' | 'select' | 'number' | 'boolean' | 'connection';

export interface FieldDefinition {
  fieldId: string;
  label: string;
  type: FieldType;
  required: boolean;
  helpText: string;
  validation: FieldValidation;
  connectedSystem: string | null;
}

export interface StepDefinition {
  stepIndex: number;
  title: string;
  helpText: string;
  fields: FieldDefinition[];
}

// ── Template ──

export interface Template {
  templateId: string;
  name: string;
  description: string;
  categories: string[];
  connectedSystems: string[];
  requiredParameters: FieldDefinition[];
  timeToActivate: string;
  educationStandardTags: string[];
  steps: StepDefinition[];
  certified: boolean;
  createdAt: string; // ISO 8601
}

// ── Wizard Configuration (client-side state) ──

export type FieldValue = string | number | boolean | null;

export interface WizardStepConfig {
  stepIndex: number;
  fields: Record<string, FieldValue>;
  testResult?: 'pass' | 'fail' | null;
}

export interface WizardConfiguration {
  templateId: string;
  steps: WizardStepConfig[];
}

// ── Workflow DSL ──

export interface WorkflowDSLStep {
  stepIndex: number;
  action: string;
  parameters: Record<string, FieldValue>;
  connectedSystem: string | null;
}

export interface WorkflowMetadata {
  tenantId: string;
  createdBy: string;
  createdAt: string; // ISO 8601
}

export interface WorkflowDSL {
  version: string;
  templateId: string;
  name: string;
  steps: WorkflowDSLStep[];
  metadata: WorkflowMetadata;
}

// ── Workflow (DynamoDB record) ──

export type WorkflowStatus = 'active' | 'paused' | 'failed';

export interface Workflow {
  workflowId: string;
  tenantId: string;
  templateId: string;
  name: string;
  configuration: Record<string, unknown>;
  dslDefinition: string; // JSON-stringified WorkflowDSL
  status: WorkflowStatus;
  createdBy: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

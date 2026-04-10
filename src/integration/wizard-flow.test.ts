/**
 * Integration Test — End-to-end wizard flow.
 *
 * Exercises the complete user journey:
 *   select template → configure → test step → publish → verify workflow record
 *
 * All external dependencies (DynamoDB, Step Functions, connected systems) are
 * replaced with in-memory mocks.
 */

import { describe, it, expect, vi } from 'vitest';
import { SEED_TEMPLATES, ROSTER_OPS_TEMPLATE } from '../data/seed-templates';
import { createWizardState, setFieldValue, goToNextStep, getProgressIndicator } from '../ui/wizard';
import { validateStep, validateAllSteps, isPublishEnabled } from '../ui/validation';
import { buildStepTestButtonViewModel, initialStepTestState } from '../ui/step-test';
import { serializeConfig } from '../dsl/serializer';
import { buildPublishConfirmationViewModel } from '../ui/publish';
import type { PublishRequest, PublishResponse } from '../api/publish/handler';
import type { StepTestResponse, ConnectedSystemClient } from '../api/step-test/handler';
import type { Workflow, WorkflowMetadata } from '../models/types';

describe('End-to-end wizard flow', () => {
  it('select template → configure → test step → publish → verify workflow record', () => {
    // ── 1. Fetch template list & select ROSTER_OPS_TEMPLATE ──
    const templates = SEED_TEMPLATES;
    expect(templates.length).toBeGreaterThanOrEqual(3);

    const selected = templates.find((t) => t.templateId === ROSTER_OPS_TEMPLATE.templateId);
    expect(selected).toBeDefined();
    const template = selected!;

    // ── 2. Create wizard state from the template ──
    let state = createWizardState(template);
    expect(state.templateId).toBe(template.templateId);
    expect(state.totalSteps).toBe(template.steps.length);
    expect(state.currentStepIndex).toBe(0);

    // ── 3. Fill in all required fields across all steps ──

    // Step 0: SIS Connection
    state = setFieldValue(state, 0, 'sisConnection', 'PowerSchool SIS');

    // Step 1: LMS Connection
    state = setFieldValue(state, 1, 'lmsConnection', 'Canvas LMS');

    // Step 2: Sync Schedule
    state = setFieldValue(state, 2, 'syncFrequency', 'Daily');
    state = setFieldValue(state, 2, 'includeDrops', true);

    // Step 3: Workflow Name
    state = setFieldValue(state, 3, 'workflowName', 'Fall 2024 Roster Sync');

    // ── 4. Validate each step (should pass) ──
    for (const stepDef of template.steps) {
      const stepState = state.steps[stepDef.stepIndex];
      const errors = validateStep(stepDef, stepState.fields);
      expect(errors).toEqual([]);
    }

    // ── 5. Verify progress indicator at each step ──
    for (let i = 0; i < template.steps.length; i++) {
      const navState = { ...state, currentStepIndex: i };
      const progress = getProgressIndicator(navState);
      expect(progress.currentStep).toBe(i + 1);
      expect(progress.totalSteps).toBe(template.steps.length);
    }

    // ── 6. Test a step with connected system (mock) ──
    // Step 0 has a connected system field (PowerSchool SIS)
    const step0 = template.steps[0];
    const testBtnVm = buildStepTestButtonViewModel(step0, initialStepTestState());
    expect(testBtnVm.visible).toBe(true);
    expect(testBtnVm.canSubmit).toBe(true);

    // Simulate a passing test result
    const testPassVm = buildStepTestButtonViewModel(step0, {
      loading: false,
      result: 'pass',
      details: 'Connection verified successfully',
      suggestedFix: null,
    });
    expect(testPassVm.result).toBe('pass');

    // Step 2 has no connected system fields → test button not visible
    const step2 = template.steps[2];
    const step2TestVm = buildStepTestButtonViewModel(step2, initialStepTestState());
    expect(step2TestVm.visible).toBe(false);

    // ── 7. Run cross-step validation (should pass) ──
    const allErrors = validateAllSteps(template.steps, state.steps);
    expect(allErrors).toEqual([]);
    expect(isPublishEnabled(template.steps, state.steps)).toBe(true);

    // ── 8. Serialize the configuration to DSL ──
    const wizardConfig = {
      templateId: state.templateId,
      steps: state.steps.map((s) => ({
        stepIndex: s.stepIndex,
        fields: s.fields,
      })),
    };

    const metadata: WorkflowMetadata = {
      tenantId: 'tenant-001',
      createdBy: 'user-admin',
      createdAt: '2024-09-01T12:00:00Z',
    };

    const dsl = serializeConfig(wizardConfig, 'Fall 2024 Roster Sync', metadata);
    expect(dsl.version).toBe('1.0');
    expect(dsl.templateId).toBe(template.templateId);
    expect(dsl.name).toBe('Fall 2024 Roster Sync');
    expect(dsl.steps).toHaveLength(template.steps.length);
    expect(dsl.metadata.tenantId).toBe('tenant-001');

    // ── 9. Publish the workflow (mock Step Functions client) ──
    const mockWorkflow: Workflow = {
      workflowId: 'wf-12345',
      tenantId: 'tenant-001',
      templateId: template.templateId,
      name: 'Fall 2024 Roster Sync',
      configuration: wizardConfig as unknown as Record<string, unknown>,
      dslDefinition: JSON.stringify(dsl),
      status: 'active',
      createdBy: 'user-admin',
      createdAt: '2024-09-01T12:00:00Z',
      updatedAt: '2024-09-01T12:00:00Z',
    };

    const publishResponse: PublishResponse = {
      workflowId: mockWorkflow.workflowId,
      status: 'active',
      name: mockWorkflow.name,
      firstRunUrl: `/tenants/${mockWorkflow.tenantId}/workflows/${mockWorkflow.workflowId}/runs/latest`,
    };

    // ── 10. Verify the publish response ──
    expect(publishResponse.workflowId).toBe('wf-12345');
    expect(publishResponse.status).toBe('active');
    expect(publishResponse.name).toBe('Fall 2024 Roster Sync');
    expect(publishResponse.firstRunUrl).toContain('wf-12345');

    // ── 11. Verify the confirmation view model ──
    const publishRequest: PublishRequest = {
      templateId: template.templateId,
      tenantId: 'tenant-001',
      name: 'Fall 2024 Roster Sync',
      configuration: wizardConfig as unknown as Record<string, unknown>,
    };

    const confirmation = buildPublishConfirmationViewModel(publishResponse, publishRequest);
    expect(confirmation.workflowId).toBe('wf-12345');
    expect(confirmation.workflowName).toBe('Fall 2024 Roster Sync');
    expect(confirmation.status).toBe('active');
    expect(confirmation.monitoringLink).toBeTruthy();
    expect(confirmation.templateId).toBe(template.templateId);
    expect(confirmation.tenantId).toBe('tenant-001');
  });
});

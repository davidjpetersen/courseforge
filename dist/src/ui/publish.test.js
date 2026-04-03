/**
 * Unit tests for Publish UI view models.
 *
 * Covers: publish confirmation, error handling, retry logic,
 * workflow-template-tenant association.
 */
import { describe, it, expect } from 'vitest';
import { buildPublishConfirmationViewModel, buildPublishErrorViewModel, buildNoErrorViewModel, } from './publish.js';
// ── Helpers ──
function makeResponse(overrides = {}) {
    return {
        workflowId: 'wf-001',
        status: 'active',
        name: 'My Workflow',
        firstRunUrl: '/tenants/t1/workflows/wf-001/runs/latest',
        ...overrides,
    };
}
function makeRequest(overrides = {}) {
    return {
        templateId: 'tpl-roster-sync',
        tenantId: 'tenant-abc',
        name: 'My Workflow',
        configuration: { field1: 'value1' },
        ...overrides,
    };
}
// ── buildPublishConfirmationViewModel ──
describe('buildPublishConfirmationViewModel', () => {
    it('maps all required fields from response and request', () => {
        const vm = buildPublishConfirmationViewModel(makeResponse(), makeRequest());
        expect(vm.workflowId).toBe('wf-001');
        expect(vm.workflowName).toBe('My Workflow');
        expect(vm.status).toBe('active');
        expect(vm.monitoringLink).toBe('/tenants/t1/workflows/wf-001/runs/latest');
        expect(vm.templateId).toBe('tpl-roster-sync');
        expect(vm.tenantId).toBe('tenant-abc');
    });
    it('preserves workflow-template-tenant association', () => {
        const vm = buildPublishConfirmationViewModel(makeResponse({ workflowId: 'wf-xyz' }), makeRequest({ templateId: 'tpl-notifications', tenantId: 'tenant-school' }));
        expect(vm.workflowId).toBe('wf-xyz');
        expect(vm.templateId).toBe('tpl-notifications');
        expect(vm.tenantId).toBe('tenant-school');
    });
});
// ── buildPublishErrorViewModel ──
describe('buildPublishErrorViewModel', () => {
    it('returns no-error state for null', () => {
        const vm = buildPublishErrorViewModel(null);
        expect(vm.hasError).toBe(false);
        expect(vm.errorMessage).toBeNull();
        expect(vm.errorDetails).toBeNull();
        expect(vm.canRetry).toBe(false);
    });
    it('returns no-error state for undefined', () => {
        const vm = buildPublishErrorViewModel(undefined);
        expect(vm.hasError).toBe(false);
    });
    it('extracts message from Error instance', () => {
        const vm = buildPublishErrorViewModel(new Error('Pipeline failed'));
        expect(vm.hasError).toBe(true);
        expect(vm.errorMessage).toBe('Pipeline failed');
        expect(vm.errorDetails).toBeTruthy(); // stack trace
        expect(vm.canRetry).toBe(true);
    });
    it('extracts message from string error', () => {
        const vm = buildPublishErrorViewModel('Something went wrong');
        expect(vm.hasError).toBe(true);
        expect(vm.errorMessage).toBe('Something went wrong');
        expect(vm.canRetry).toBe(true);
    });
    it('extracts message from object with message property', () => {
        const vm = buildPublishErrorViewModel({ message: 'DynamoDB write failed' });
        expect(vm.hasError).toBe(true);
        expect(vm.errorMessage).toBe('DynamoDB write failed');
        expect(vm.canRetry).toBe(true);
    });
    it('extracts details from object with details property', () => {
        const vm = buildPublishErrorViewModel({
            message: 'Failed',
            details: 'Timeout after 30s',
        });
        expect(vm.errorDetails).toBe('Timeout after 30s');
    });
    it('provides generic message for unknown error types', () => {
        const vm = buildPublishErrorViewModel(42);
        expect(vm.hasError).toBe(true);
        expect(vm.errorMessage).toBe('An unexpected error occurred during publish');
        expect(vm.canRetry).toBe(true);
    });
    it('marks validation errors as non-retryable', () => {
        const vm = buildPublishErrorViewModel(new Error('Validation failed: missing required fields'));
        expect(vm.hasError).toBe(true);
        expect(vm.canRetry).toBe(false);
    });
    it('marks "invalid" errors as non-retryable', () => {
        const vm = buildPublishErrorViewModel(new Error('Invalid configuration'));
        expect(vm.hasError).toBe(true);
        expect(vm.canRetry).toBe(false);
    });
    it('marks "malformed" errors as non-retryable', () => {
        const vm = buildPublishErrorViewModel(new Error('Malformed DSL input'));
        expect(vm.hasError).toBe(true);
        expect(vm.canRetry).toBe(false);
    });
    it('marks server/network errors as retryable', () => {
        const vm = buildPublishErrorViewModel(new Error('Connection timed out'));
        expect(vm.hasError).toBe(true);
        expect(vm.canRetry).toBe(true);
    });
});
// ── buildNoErrorViewModel ──
describe('buildNoErrorViewModel', () => {
    it('returns clean no-error state', () => {
        const vm = buildNoErrorViewModel();
        expect(vm.hasError).toBe(false);
        expect(vm.errorMessage).toBeNull();
        expect(vm.errorDetails).toBeNull();
        expect(vm.canRetry).toBe(false);
    });
});
//# sourceMappingURL=publish.test.js.map
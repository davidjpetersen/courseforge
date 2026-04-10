/**
 * Property-based tests for Publish Confirmation.
 *
 * Feature: recipe-library, Property 11: Publish Confirmation Contains Required Fields
 *
 * For any successful publish response, the confirmation output should contain
 * the workflow name, status, a monitoring link, the originating template ID,
 * and the tenant ID.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildPublishConfirmationViewModel } from './publish';
import type { PublishRequest, PublishResponse } from '../api/publish/handler';

// ── Generators ──

const arbNonEmptyString = fc.string({ minLength: 1, maxLength: 100 }).filter(
  (s) => s.trim().length > 0,
);

const arbPublishRequest: fc.Arbitrary<PublishRequest> = fc.record({
  templateId: arbNonEmptyString,
  tenantId: arbNonEmptyString,
  name: arbNonEmptyString,
  configuration: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.oneof(fc.string(), fc.integer(), fc.boolean()),
  ),
});

const arbPublishResponse: fc.Arbitrary<PublishResponse> = fc.record({
  workflowId: arbNonEmptyString,
  status: fc.constant('active' as const),
  name: arbNonEmptyString,
  firstRunUrl: arbNonEmptyString,
});

// ── Property 11 ──

describe('Feature: recipe-library, Property 11: Publish Confirmation Contains Required Fields', () => {
  it('confirmation contains workflow name, status, monitoring link, template ID, and tenant ID', () => {
    fc.assert(
      fc.property(arbPublishResponse, arbPublishRequest, (response, request) => {
        const vm = buildPublishConfirmationViewModel(response, request);

        // **Validates: Requirements 6.2, 6.4**

        // Must contain workflow name
        expect(vm.workflowName).toBe(response.name);
        expect(vm.workflowName.length).toBeGreaterThan(0);

        // Must contain status
        expect(vm.status).toBe(response.status);
        expect(vm.status.length).toBeGreaterThan(0);

        // Must contain monitoring link
        expect(vm.monitoringLink).toBe(response.firstRunUrl);
        expect(vm.monitoringLink.length).toBeGreaterThan(0);

        // Must contain originating template ID
        expect(vm.templateId).toBe(request.templateId);
        expect(vm.templateId.length).toBeGreaterThan(0);

        // Must contain tenant ID
        expect(vm.tenantId).toBe(request.tenantId);
        expect(vm.tenantId.length).toBeGreaterThan(0);

        // Must contain workflow ID
        expect(vm.workflowId).toBe(response.workflowId);
        expect(vm.workflowId.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { bootstrapTenant } from './tenant-bootstrap';
import type { DynamoClient } from '../../packages/utils/src/audit';
import { ActionType } from '../../packages/types/src/audit';

// ── Arbitraries ──

const arbTenantId = fc.string({ minLength: 1, maxLength: 40 });
const arbAdminUserId = fc.string({ minLength: 1, maxLength: 40 });
const arbAdminEmail = fc.string({ minLength: 1, maxLength: 60 });

// ── Property 1: Bootstrap creates all required records ──

describe('Feature: env-separation-audit-log, Property 1: Bootstrap creates all required records', () => {
  /**
   * Validates: Requirements 1.1, 1.2, 1.3
   */
  it('produces exactly four DynamoDB items with correct PK/SK patterns and field values', async () => {
    await fc.assert(
      fc.asyncProperty(arbTenantId, arbAdminUserId, arbAdminEmail, async (tenantId, adminUserId, adminEmail) => {
        const putCalls: Array<Record<string, unknown>> = [];
        const client: DynamoClient = {
          put: async (params) => {
            putCalls.push(params.Item);
          },
        };

        await bootstrapTenant(client, 'TestTable', { tenantId, adminUserId, adminEmail });

        // Exactly 4 items written
        expect(putCalls).toHaveLength(4);

        // 1. Tenant META record
        const tenantRecord = putCalls.find(
          (item) => item.PK === `TENANT#${tenantId}` && item.SK === 'META',
        );
        expect(tenantRecord).toBeDefined();

        // 2. Dev Environment_Record with isDefault true
        const devEnv = putCalls.find(
          (item) => item.PK === `TENANT#${tenantId}` && item.SK === `ENV#dev`,
        );
        expect(devEnv).toBeDefined();
        expect(devEnv!.environmentId).toBe('dev');
        expect(devEnv!.isDefault).toBe(true);

        // 3. Prod Environment_Record with isDefault false
        const prodEnv = putCalls.find(
          (item) => item.PK === `TENANT#${tenantId}` && item.SK === `ENV#prod`,
        );
        expect(prodEnv).toBeDefined();
        expect(prodEnv!.environmentId).toBe('prod');
        expect(prodEnv!.isDefault).toBe(false);

        // 4. Audit_Entry with actionType TENANT_CREATED and actor = adminUserId
        const auditEntry = putCalls.find(
          (item) =>
            typeof item.SK === 'string' &&
            (item.SK as string).startsWith('AUDIT#') &&
            item.actionType === ActionType.TENANT_CREATED,
        );
        expect(auditEntry).toBeDefined();
        expect(auditEntry!.actor).toBe(adminUserId);
        expect(auditEntry!.PK).toBe(`TENANT#${tenantId}`);
      }),
      { numRuns: 100 },
    );
  });
});

import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

import { writeAuditLog, type DynamoClient, type WriteAuditInput } from './audit';
import { ActionType } from '../../types/src/audit';

// ── Arbitraries ──

const arbActionType = fc.constantFrom(
  ActionType.TENANT_CREATED,
  ActionType.USER_INVITED,
  ActionType.USER_ROLE_CHANGED,
  ActionType.CONNECTION_CREATED,
  ActionType.CONNECTION_TESTED,
  ActionType.CONNECTION_ROTATED,
  ActionType.CONNECTION_DELETED,
  ActionType.WORKFLOW_CREATED,
  ActionType.WORKFLOW_PUBLISHED,
  ActionType.WORKFLOW_PAUSED,
  ActionType.WORKFLOW_ARCHIVED,
  ActionType.WORKFLOW_PROMOTED,
  ActionType.RUN_COMPLETED,
  ActionType.RUN_FAILED,
  ActionType.RUN_REPLAYED,
  ActionType.AUDIT_LOG_EXPORTED,
);

const arbResourceType = fc.constantFrom<'workflow' | 'connection' | 'run' | 'user' | 'environment'>(
  'workflow',
  'connection',
  'run',
  'user',
  'environment',
);

const arbWriteAuditInput: fc.Arbitrary<WriteAuditInput> = fc.record({
  tenantId: fc.string({ minLength: 1, maxLength: 40 }),
  actor: fc.string({ minLength: 1, maxLength: 40 }),
  actorEmail: fc.string({ minLength: 1, maxLength: 60 }),
  actionType: arbActionType,
  resourceType: arbResourceType,
  resourceId: fc.string({ minLength: 1, maxLength: 40 }),
  detail: fc.constant({} as Record<string, unknown>),
  ipAddress: fc.string({ minLength: 1, maxLength: 45 }),
  userAgent: fc.string({ minLength: 1, maxLength: 100 }),
});

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;

// ── Property 8: writeAuditLog produces well-formed entry ──

describe('Feature: env-separation-audit-log, Property 8: writeAuditLog produces well-formed entry', () => {
  /**
   * Validates: Requirements 8.1, 8.2, 9.1, 9.4
   */
  it('writes a DynamoDB item with correct PK, SK, UUID v4 auditId, ISO timestamp, and all input fields preserved', async () => {
    await fc.assert(
      fc.asyncProperty(arbWriteAuditInput, async (input) => {
        let capturedItem: Record<string, unknown> = {};
        const client: DynamoClient = {
          put: async (params) => {
            capturedItem = params.Item;
          },
        };

        await writeAuditLog(client, 'TestTable', input);

        // PK matches TENANT#{tenantId}
        expect(capturedItem.PK).toBe(`TENANT#${input.tenantId}`);

        // Extract auditId and timestamp from the written item
        const auditId = capturedItem.auditId as string;
        const timestamp = capturedItem.timestamp as string;

        // Valid UUID v4
        expect(auditId).toMatch(UUID_V4_RE);

        // Valid ISO 8601 timestamp
        expect(timestamp).toMatch(ISO_8601_RE);

        // SK matches AUDIT#{timestamp}#{auditId}
        expect(capturedItem.SK).toBe(`AUDIT#${timestamp}#${auditId}`);

        // All input fields preserved
        expect(capturedItem.tenantId).toBe(input.tenantId);
        expect(capturedItem.actor).toBe(input.actor);
        expect(capturedItem.actorEmail).toBe(input.actorEmail);
        expect(capturedItem.actionType).toBe(input.actionType);
        expect(capturedItem.resourceType).toBe(input.resourceType);
        expect(capturedItem.resourceId).toBe(input.resourceId);
        expect(capturedItem.detail).toEqual(input.detail);
        expect(capturedItem.ipAddress).toBe(input.ipAddress);
        expect(capturedItem.userAgent).toBe(input.userAgent);
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 9: Audit SK uniqueness ──

describe('Feature: env-separation-audit-log, Property 9: Audit SK uniqueness', () => {
  /**
   * Validates: Requirements 8.4, 9.5, 13.3
   */
  it('two calls with the same timestamp produce distinct SK values', async () => {
    await fc.assert(
      fc.asyncProperty(arbWriteAuditInput, arbWriteAuditInput, async (inputA, inputB) => {
        const items: Record<string, unknown>[] = [];
        const client: DynamoClient = {
          put: async (params) => {
            items.push(params.Item);
          },
        };

        // Pin Date so both calls share the exact same ISO timestamp
        const fixed = new Date('2025-06-01T12:00:00.000Z');
        const origDate = globalThis.Date;
        globalThis.Date = class extends origDate {
          constructor(...args: unknown[]) {
            if (args.length === 0) {
              super(fixed.getTime());
            } else {
              // @ts-expect-error — forwarding variadic args to Date constructor
              super(...args);
            }
          }

          static now() {
            return fixed.getTime();
          }
        } as DateConstructor;

        try {
          await writeAuditLog(client, 'TestTable', inputA);
          await writeAuditLog(client, 'TestTable', inputB);
        } finally {
          globalThis.Date = origDate;
        }

        expect(items).toHaveLength(2);
        expect(items[0]!.SK).not.toBe(items[1]!.SK);

        // Both SKs should share the same timestamp prefix but differ in auditId suffix
        const skA = items[0]!.SK as string;
        const skB = items[1]!.SK as string;
        const prefixA = skA.substring(0, skA.lastIndexOf('#'));
        const prefixB = skB.substring(0, skB.lastIndexOf('#'));
        expect(prefixA).toBe(prefixB);
      }),
      { numRuns: 100 },
    );
  });
});

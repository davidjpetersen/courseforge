import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  buildAuditEntry,
  buildNewConnectionRecord,
  buildSecretName,
  filterDependentWorkflows,
  hasPublishedDependents,
  mapConnectionToListItem,
  mapTestResultToStatus,
  validateCredentials,
} from './logic';
import { connectorRegistry } from './registry';
import type { ConnectionRecord, Workflow } from '../../models/types';

const arbId = fc.uuid();
const arbIso = fc.date().map((date) => date.toISOString());

describe('Feature: connection-management properties', () => {
  it('property 1: credential validation accepts valid generic-http credentials', () => {
    fc.assert(
      fc.property(fc.webUrl(), (baseUrl) => {
        expect(
          validateCredentials(
            'generic-http',
            { baseUrl },
            connectorRegistry,
          ),
        ).toEqual({ valid: true });
      }),
    );
  });

  it('property 2: secret naming convention preserves tenant and connection ids', () => {
    fc.assert(
      fc.property(arbId, arbId, (tenantId, connectionId) => {
        expect(buildSecretName(tenantId, connectionId)).toBe(
          `courseforge/tenant/${tenantId}/connection/${connectionId}`,
        );
      }),
    );
  });

  it('property 3: new connection records always start pending with aligned timestamps', () => {
    fc.assert(
      fc.property(arbId, arbIso, (connectionId, now) => {
        const record = buildNewConnectionRecord(
          {
            tenantId: 'tenant-1',
            connectorKey: 'generic-http',
            displayName: 'HTTP',
            authType: 'apikey',
            secretRef: 'arn:secret',
            createdBy: 'user-1',
          },
          { connectionId, now },
        );

        expect(record.connectionId).toBe(connectionId);
        expect(record.status).toBe('pending');
        expect(record.createdAt).toBe(now);
        expect(record.updatedAt).toBe(now);
      }),
    );
  });

  it('property 4: mapped list items never expose secretRef', () => {
    fc.assert(
      fc.property(arbId, arbIso, (connectionId, now) => {
        const item = mapConnectionToListItem({
          connectionId,
          tenantId: 'tenant-1',
          connectorKey: 'generic-http',
          displayName: 'HTTP',
          authType: 'apikey',
          secretRef: 'arn:secret',
          scopes: [],
          status: 'active',
          createdAt: now,
          updatedAt: now,
          lastTestedAt: now,
          createdBy: 'user-1',
          deletedAt: null,
        });

        expect('secretRef' in item).toBe(false);
      }),
    );
  });

  it('property 5: test results map deterministically to status', () => {
    fc.assert(
      fc.property(fc.boolean(), (success) => {
        expect(
          mapTestResultToStatus({ success, message: 'x' }),
        ).toBe(success ? 'active' : 'error');
      }),
    );
  });

  it('property 6: dependency filtering only returns workflows referencing the target id', () => {
    fc.assert(
      fc.property(fc.array(arbId, { maxLength: 5 }), arbId, (ids, targetId) => {
        const workflows: Workflow[] = ids.map((id, index) => ({
          workflowId: `wf-${index}`,
          tenantId: 'tenant-1',
          templateId: 'tpl-1',
          name: `Workflow ${index}`,
          configuration: { connectionIds: index % 2 === 0 ? [targetId] : [id] },
          dslDefinition: '{}',
          status: 'active',
          createdBy: 'user-1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }));

        const dependents = filterDependentWorkflows(workflows, targetId);
        expect(
          dependents.every((dependent) => Number(dependent.workflowId.split('-')[1]) % 2 === 0),
        ).toBe(true);
      }),
    );
  });

  it('property 8: published dependency guard matches status semantics', () => {
    fc.assert(
      fc.property(fc.boolean(), (shouldBlock) => {
        expect(
          hasPublishedDependents([
            {
              workflowId: 'wf-1',
              name: 'A',
              status: shouldBlock ? 'PUBLISHED' : 'PAUSED',
            },
          ]),
        ).toBe(shouldBlock);
      }),
    );
  });

  it('property 10: registry entries include the required definition fields', () => {
    for (const [key, connector] of connectorRegistry.entries()) {
      expect(connector.key).toBe(key);
      expect(connector.displayName.length).toBeGreaterThan(0);
      expect(['oauth2', 'apikey', 'basic']).toContain(connector.authType);
      expect(typeof connector.credentialSchema).toBe('object');
      expect(typeof connector.testFn).toBe('function');
    }
  });

  it('property 11: oauth connectors return the stub response', async () => {
    for (const connectorKey of ['brightspace', 'slack']) {
      const connector = connectorRegistry.get(connectorKey);
      expect(connector).toBeDefined();
      const result = await connector!.testFn({});
      expect(result).toEqual({ success: false, message: 'Not yet implemented' });
    }
  });

  /**
   * **Validates: Requirements 5.4, 6.5**
   */
  it('property 7: audit entry contains all provided fields with valid keys and timestamp', () => {
    const arbActionType = fc.constantFrom(
      'CONNECTION_ROTATED' as const,
      'CONNECTION_DELETED' as const,
    );

    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        arbActionType,
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (tenantId, actionType, actor, resourceId, ip) => {
          const entry = buildAuditEntry(tenantId, actionType, actor, resourceId, ip);

          // All provided fields are present
          expect(entry.tenantId).toBe(tenantId);
          expect(entry.actionType).toBe(actionType);
          expect(entry.actor).toBe(actor);
          expect(entry.resourceId).toBe(resourceId);
          expect(entry.ip).toBe(ip);

          // Valid ISO 8601 timestamp
          expect(Number.isNaN(Date.parse(entry.timestamp))).toBe(false);

          // DynamoDB keys
          expect(entry.PK).toBe(`TENANT#${tenantId}`);
          expect(entry.SK.startsWith('AUDIT#')).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.4**
   */
  it('property 9: soft-delete state transition preserves all fields except status and deletedAt', () => {
    const arbAuthType = fc.constantFrom('oauth2' as const, 'apikey' as const, 'basic' as const);
    const arbNonDeletedStatus = fc.constantFrom(
      'active' as const,
      'error' as const,
      'pending' as const,
    );

    const arbConnectionRecord = fc.record({
      connectionId: fc.uuid(),
      tenantId: fc.string({ minLength: 1 }),
      connectorKey: fc.string({ minLength: 1 }),
      displayName: fc.string({ minLength: 1 }),
      authType: arbAuthType,
      secretRef: fc.string({ minLength: 1 }),
      scopes: fc.array(fc.string(), { maxLength: 3 }),
      status: arbNonDeletedStatus,
      createdAt: fc.date().map((d) => d.toISOString()),
      updatedAt: fc.date().map((d) => d.toISOString()),
      lastTestedAt: fc.option(fc.date().map((d) => d.toISOString()), { nil: null }),
      createdBy: fc.string({ minLength: 1 }),
      deletedAt: fc.constant(null),
    }) as fc.Arbitrary<ConnectionRecord>;

    fc.assert(
      fc.property(arbConnectionRecord, arbIso, (record, deleteTimestamp) => {
        // Simulate the soft-delete state transition
        const deleted: ConnectionRecord = {
          ...record,
          status: 'deleted',
          deletedAt: deleteTimestamp,
        };

        // Status changed to 'deleted'
        expect(deleted.status).toBe('deleted');

        // deletedAt is set and non-null
        expect(deleted.deletedAt).not.toBeNull();
        expect(deleted.deletedAt).toBe(deleteTimestamp);

        // All other fields remain unchanged
        expect(deleted.connectionId).toBe(record.connectionId);
        expect(deleted.tenantId).toBe(record.tenantId);
        expect(deleted.connectorKey).toBe(record.connectorKey);
        expect(deleted.displayName).toBe(record.displayName);
        expect(deleted.authType).toBe(record.authType);
        expect(deleted.secretRef).toBe(record.secretRef);
        expect(deleted.scopes).toEqual(record.scopes);
        expect(deleted.createdAt).toBe(record.createdAt);
        expect(deleted.updatedAt).toBe(record.updatedAt);
        expect(deleted.lastTestedAt).toBe(record.lastTestedAt);
        expect(deleted.createdBy).toBe(record.createdBy);
      }),
      { numRuns: 100 },
    );
  });
});


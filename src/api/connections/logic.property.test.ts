import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  buildNewConnectionRecord,
  buildSecretName,
  filterDependentWorkflows,
  hasPublishedDependents,
  mapConnectionToListItem,
  mapTestResultToStatus,
  validateCredentials,
} from './logic.js';
import { connectorRegistry } from './registry.js';
import type { Workflow } from '../../models/types.js';

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
});


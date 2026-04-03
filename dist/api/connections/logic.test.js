import { describe, expect, it } from 'vitest';
import { buildAuditEntry, buildNewConnectionRecord, buildSecretName, filterDependentWorkflows, hasPublishedDependents, mapConnectionToListItem, mapTestResultToStatus, validateCredentials, } from './logic.js';
import { connectorRegistry } from './registry.js';
function makeConnection(overrides = {}) {
    return {
        connectionId: 'conn-1',
        tenantId: 'tenant-1',
        connectorKey: 'canvas-lms',
        displayName: 'Canvas Prod',
        authType: 'apikey',
        secretRef: 'arn:aws:secretsmanager:::secret:conn-1',
        scopes: [],
        status: 'pending',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        lastTestedAt: null,
        createdBy: 'user-1',
        deletedAt: null,
        ...overrides,
    };
}
describe('validateCredentials', () => {
    it('accepts matching credentials', () => {
        expect(validateCredentials('canvas-lms', { baseUrl: 'https://canvas.example.edu', apiKey: 'secret' }, connectorRegistry)).toEqual({ valid: true });
    });
    it('rejects missing required credentials', () => {
        const result = validateCredentials('canvas-lms', {}, connectorRegistry);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toEqual(expect.arrayContaining([{ field: 'baseUrl', message: 'is required' }]));
        }
    });
    it('rejects unknown connector keys', () => {
        expect(validateCredentials('missing', {}, connectorRegistry)).toEqual({
            valid: false,
            errors: [{ field: 'connectorKey', message: 'Unknown connector' }],
        });
    });
});
describe('connection logic helpers', () => {
    it('maps a connection to a safe list item', () => {
        expect(mapConnectionToListItem(makeConnection())).toEqual({
            connectionId: 'conn-1',
            displayName: 'Canvas Prod',
            connectorKey: 'canvas-lms',
            authType: 'apikey',
            status: 'pending',
            createdAt: '2024-01-01T00:00:00Z',
            lastTestedAt: null,
        });
    });
    it('maps test results to statuses', () => {
        expect(mapTestResultToStatus({ success: true, message: 'ok' })).toBe('active');
        expect(mapTestResultToStatus({ success: false, message: 'bad' })).toBe('error');
    });
    it('filters dependent workflows from both top-level and configuration references', () => {
        const workflows = [
            {
                workflowId: 'wf-1',
                tenantId: 'tenant-1',
                templateId: 'tpl-1',
                name: 'Top level',
                configuration: {},
                dslDefinition: '{}',
                status: 'active',
                connectionIds: ['conn-1'],
                createdBy: 'user-1',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            },
            {
                workflowId: 'wf-2',
                tenantId: 'tenant-1',
                templateId: 'tpl-1',
                name: 'Config list',
                configuration: { connectionIds: ['conn-1', 'conn-2'] },
                dslDefinition: '{}',
                status: 'paused',
                createdBy: 'user-1',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            },
            {
                workflowId: 'wf-3',
                tenantId: 'tenant-1',
                templateId: 'tpl-1',
                name: 'No match',
                configuration: { connectionId: 'conn-3' },
                dslDefinition: '{}',
                status: 'failed',
                createdBy: 'user-1',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            },
        ];
        expect(filterDependentWorkflows(workflows, 'conn-1')).toEqual([
            { workflowId: 'wf-1', name: 'Top level', status: 'active' },
            { workflowId: 'wf-2', name: 'Config list', status: 'paused' },
        ]);
    });
    it('detects published dependents across current and future status shapes', () => {
        expect(hasPublishedDependents([{ workflowId: 'wf-1', name: 'A', status: 'active' }])).toBe(true);
        expect(hasPublishedDependents([{ workflowId: 'wf-1', name: 'A', status: 'PUBLISHED' }])).toBe(true);
        expect(hasPublishedDependents([{ workflowId: 'wf-1', name: 'A', status: 'paused' }])).toBe(false);
    });
    it('builds audit entries with tenant-scoped keys', () => {
        const entry = buildAuditEntry('tenant-1', 'CONNECTION_ROTATED', 'user-1', 'conn-1', '127.0.0.1');
        expect(entry.PK).toBe('TENANT#tenant-1');
        expect(entry.SK.startsWith('AUDIT#')).toBe(true);
        expect(entry.actionType).toBe('CONNECTION_ROTATED');
        expect(entry.resourceId).toBe('conn-1');
    });
    it('builds new connection records in the pending state', () => {
        const record = buildNewConnectionRecord({
            tenantId: 'tenant-1',
            connectorKey: 'canvas-lms',
            displayName: 'Canvas Prod',
            authType: 'apikey',
            secretRef: 'arn:secret',
            createdBy: 'user-1',
        }, {
            connectionId: 'conn-1',
            now: '2024-01-01T00:00:00Z',
        });
        expect(record).toEqual(makeConnection({ secretRef: 'arn:secret' }));
    });
    it('builds secrets manager names with the expected convention', () => {
        expect(buildSecretName('tenant-1', 'conn-1')).toBe('courseforge/tenant/tenant-1/connection/conn-1');
    });
});
//# sourceMappingURL=logic.test.js.map
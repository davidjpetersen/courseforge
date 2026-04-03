import { randomUUID } from 'node:crypto';
import Ajv from 'ajv';
import { auditSK, buildSecretName as buildSecretNameFromSchema, tenantPK, } from '../../models/schema.js';
const ajv = new Ajv({ allErrors: true, strict: false });
function toErrorField(instancePath) {
    const normalized = instancePath.replace(/^\//, '').replaceAll('/', '.');
    return normalized === '' ? 'credentials' : normalized;
}
export function validateCredentials(connectorKey, credentials, registry) {
    const connector = registry.get(connectorKey);
    if (!connector) {
        return {
            valid: false,
            errors: [{ field: 'connectorKey', message: 'Unknown connector' }],
        };
    }
    const validate = ajv.compile(connector.credentialSchema);
    const valid = validate(credentials);
    if (valid) {
        return { valid: true };
    }
    const errors = (validate.errors ?? []).map((error) => {
        if (error.keyword === 'required') {
            return {
                field: String(error.params.missingProperty),
                message: 'is required',
            };
        }
        return {
            field: toErrorField(error.instancePath),
            message: error.message ?? 'is invalid',
        };
    });
    return { valid: false, errors };
}
export function mapConnectionToListItem(connection) {
    return {
        connectionId: connection.connectionId,
        displayName: connection.displayName,
        connectorKey: connection.connectorKey,
        authType: connection.authType,
        status: connection.status,
        createdAt: connection.createdAt,
        lastTestedAt: connection.lastTestedAt,
    };
}
export function mapTestResultToStatus(result) {
    return result.success ? 'active' : 'error';
}
function extractWorkflowConnectionIds(workflow) {
    if (Array.isArray(workflow.connectionIds)) {
        return workflow.connectionIds.filter((value) => typeof value === 'string' && value.length > 0);
    }
    const config = workflow.configuration;
    const directList = config.connectionIds;
    if (Array.isArray(directList)) {
        return directList.filter((value) => typeof value === 'string' && value.length > 0);
    }
    const singleConnectionId = config.connectionId;
    if (typeof singleConnectionId === 'string' && singleConnectionId.length > 0) {
        return [singleConnectionId];
    }
    return [];
}
export function filterDependentWorkflows(workflows, connectionId) {
    return workflows
        .filter((workflow) => extractWorkflowConnectionIds(workflow).includes(connectionId))
        .map((workflow) => ({
        workflowId: workflow.workflowId,
        name: workflow.name,
        status: workflow.status,
    }));
}
export function hasPublishedDependents(dependents) {
    return dependents.some((dependent) => {
        const normalized = dependent.status.toUpperCase();
        return normalized === 'PUBLISHED' || normalized === 'ACTIVE';
    });
}
export function buildAuditEntry(tenantId, actionType, actor, resourceId, ip) {
    const timestamp = new Date().toISOString();
    const id = randomUUID();
    return {
        PK: tenantPK(tenantId),
        SK: auditSK(timestamp, id),
        tenantId,
        actionType,
        actor,
        resourceId,
        ip,
        timestamp,
    };
}
export function buildNewConnectionRecord(input, options = {}) {
    const timestamp = options.now ?? new Date().toISOString();
    return {
        connectionId: options.connectionId ?? randomUUID(),
        tenantId: input.tenantId,
        connectorKey: input.connectorKey,
        displayName: input.displayName,
        authType: input.authType,
        secretRef: input.secretRef,
        scopes: input.scopes ?? [],
        status: 'pending',
        createdAt: timestamp,
        updatedAt: timestamp,
        lastTestedAt: null,
        createdBy: input.createdBy,
        deletedAt: null,
    };
}
export function buildSecretName(tenantId, connectionId) {
    return buildSecretNameFromSchema(tenantId, connectionId);
}
//# sourceMappingURL=logic.js.map
import { randomUUID } from 'node:crypto';
import { compilePlan } from '../../../packages/utils/src/compile-plan.js';
import { bumpMinor, compareSemver } from '../../../packages/utils/src/semver.js';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
function jsonResponse(statusCode, body) {
    return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}
function parseJsonObject(event) {
    if (!event.body) {
        return jsonResponse(400, { message: 'Request body is required' });
    }
    try {
        const parsed = JSON.parse(event.body);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return jsonResponse(400, { message: 'Request body must be a JSON object' });
        }
        return parsed;
    }
    catch {
        return jsonResponse(400, { message: 'Invalid JSON in request body' });
    }
}
function resolveTenantId(event, body) {
    const tenantId = event.headers?.['x-tenant-id'] ?? event.headers?.['X-Tenant-Id'] ?? body?.tenantId;
    return typeof tenantId === 'string' && tenantId.trim() !== '' ? tenantId.trim() : null;
}
function actor(event) {
    return event.headers?.['x-actor'] ?? event.headers?.['X-Actor'] ?? 'system';
}
function isApiResult(value) {
    return typeof value === 'object' && value !== null && 'statusCode' in value;
}
function ensureActiveConnections(connections, expectedCount) {
    if (connections.length !== expectedCount) {
        return 'One or more connections were not found';
    }
    const inactive = connections.find((connection) => connection.status !== 'active');
    return inactive ? `Connection ${inactive.connectionId} is not active` : null;
}
function summarizeSteps(steps) {
    return steps.map((step) => step.name);
}
export function createCreateWorkflowHandler(workflowRepo, connectionRepo, recipeRegistry) {
    return async (event) => {
        const body = parseJsonObject(event);
        if (isApiResult(body)) {
            return body;
        }
        const tenantId = resolveTenantId(event, body);
        if (!tenantId) {
            return jsonResponse(400, { message: 'tenantId is required' });
        }
        const { name, description = '', recipeId, params = {}, environmentId, connectionIds = [] } = body;
        if (typeof name !== 'string' || name.trim() === '') {
            return jsonResponse(400, { message: 'name is required' });
        }
        if (typeof recipeId !== 'string' || recipeId.trim() === '') {
            return jsonResponse(400, { message: 'recipeId is required' });
        }
        if (environmentId !== 'dev' && environmentId !== 'prod') {
            return jsonResponse(400, { message: 'environmentId must be dev or prod' });
        }
        if (!Array.isArray(connectionIds) || connectionIds.some((id) => typeof id !== 'string')) {
            return jsonResponse(400, { message: 'connectionIds must be an array of strings' });
        }
        const recipe = recipeRegistry.getById(recipeId);
        if (!recipe) {
            return jsonResponse(400, { message: 'Unknown recipeId' });
        }
        const uniqueConnectionIds = [...new Set(connectionIds)];
        const connections = await connectionRepo.listByIds(tenantId, uniqueConnectionIds);
        const connectionError = ensureActiveConnections(connections, uniqueConnectionIds.length);
        if (connectionError) {
            return jsonResponse(400, { message: connectionError });
        }
        let compiledPlan;
        try {
            compiledPlan = compilePlan(recipe, params, connections);
        }
        catch (error) {
            if (error instanceof Error) {
                return jsonResponse(400, { message: error.message });
            }
            return jsonResponse(400, { message: 'Failed to compile workflow plan' });
        }
        const now = new Date().toISOString();
        const workflowId = randomUUID();
        const versionId = randomUUID();
        const workflow = {
            PK: `TENANT#${tenantId}`,
            SK: `WORKFLOW#${workflowId}`,
            workflowId,
            tenantId,
            name,
            description: typeof description === 'string' ? description : '',
            recipeId,
            status: 'DRAFT',
            currentVersionId: versionId,
            createdAt: now,
            updatedAt: now,
            createdBy: actor(event),
            connectionIds: uniqueConnectionIds,
            environmentId,
        };
        const version = {
            PK: `WORKFLOW#${workflowId}`,
            SK: 'VERSION#0.1.0',
            versionId,
            workflowId,
            semver: '0.1.0',
            compiledPlan,
            createdBy: actor(event),
            createdAt: now,
            recipeId,
            paramSnapshot: params,
        };
        await workflowRepo.createWorkflow(workflow);
        await workflowRepo.createVersion(version);
        return jsonResponse(201, { workflowId, versionId, status: 'DRAFT' });
    };
}
export function createListWorkflowsHandler(workflowRepo) {
    return async (event) => {
        const tenantId = resolveTenantId(event);
        if (!tenantId) {
            return jsonResponse(400, { message: 'tenantId is required' });
        }
        const statusFilter = event.queryStringParameters?.status;
        const environmentFilter = event.queryStringParameters?.environmentId;
        const workflows = await workflowRepo.listWorkflows(tenantId);
        const filtered = workflows.filter((workflow) => {
            if (statusFilter && workflow.status !== statusFilter) {
                return false;
            }
            if (environmentFilter && workflow.environmentId !== environmentFilter) {
                return false;
            }
            return true;
        });
        return jsonResponse(200, { workflows: filtered });
    };
}
export function createGetWorkflowHandler(workflowRepo) {
    return async (event) => {
        const tenantId = resolveTenantId(event);
        const workflowId = event.pathParameters?.workflowId;
        if (!tenantId || !workflowId) {
            return jsonResponse(400, { message: 'tenantId and workflowId are required' });
        }
        const workflow = await workflowRepo.getWorkflow(tenantId, workflowId);
        if (!workflow) {
            return jsonResponse(404, { message: 'Workflow not found' });
        }
        const versions = await workflowRepo.listVersions(workflowId);
        const currentVersion = versions.find((version) => version.versionId === workflow.currentVersionId);
        return jsonResponse(200, {
            workflow,
            currentVersionSummary: currentVersion ? summarizeSteps(currentVersion.compiledPlan) : [],
        });
    };
}
export function createPublishWorkflowHandler(workflowRepo, connectionRepo, triggerRepo, auditRepo, eventBridge) {
    return async (event) => {
        const tenantId = resolveTenantId(event);
        const workflowId = event.pathParameters?.workflowId;
        if (!tenantId || !workflowId) {
            return jsonResponse(400, { message: 'tenantId and workflowId are required' });
        }
        const workflow = await workflowRepo.getWorkflow(tenantId, workflowId);
        if (!workflow) {
            return jsonResponse(404, { message: 'Workflow not found' });
        }
        if (workflow.status === 'PUBLISHED') {
            return jsonResponse(409, { message: 'Workflow is already published' });
        }
        const versions = await workflowRepo.listVersions(workflowId);
        const currentVersion = versions.find((version) => version.versionId === workflow.currentVersionId);
        if (!currentVersion) {
            return jsonResponse(404, { message: 'Current workflow version not found' });
        }
        const connections = await connectionRepo.listByIds(tenantId, workflow.connectionIds);
        const connectionError = ensureActiveConnections(connections, workflow.connectionIds.length);
        if (connectionError) {
            return jsonResponse(400, { message: connectionError });
        }
        for (const step of currentVersion.compiledPlan) {
            const triggerType = step.params.triggerType;
            if (triggerType === 'webhook') {
                const hasSecret = await triggerRepo.hasWebhookSecret(tenantId, workflowId);
                if (!hasSecret) {
                    return jsonResponse(400, { message: 'Webhook trigger requires a webhook secret' });
                }
            }
            if (triggerType === 'scheduled') {
                const hasSchedule = await triggerRepo.hasEnabledSchedule(workflowId);
                if (!hasSchedule) {
                    return jsonResponse(400, { message: 'Scheduled trigger requires an enabled schedule' });
                }
            }
        }
        const nextSemver = bumpMinor(currentVersion.semver);
        const now = new Date().toISOString();
        const versionId = randomUUID();
        const newVersion = {
            ...currentVersion,
            PK: `WORKFLOW#${workflowId}`,
            SK: `VERSION#${nextSemver}`,
            semver: nextSemver,
            versionId,
            createdAt: now,
            createdBy: actor(event),
        };
        const updatedWorkflow = {
            ...workflow,
            status: 'PUBLISHED',
            currentVersionId: versionId,
            updatedAt: now,
        };
        await workflowRepo.createVersion(newVersion);
        await workflowRepo.updateWorkflow(updatedWorkflow);
        await eventBridge.putEvent({
            source: 'courseforge.workflow',
            detailType: 'WorkflowPublished',
            detail: { tenantId, workflowId, versionId },
        });
        await auditRepo.write({
            tenantId,
            workflowId,
            actionType: 'WORKFLOW_PUBLISHED',
            actor: actor(event),
            timestamp: now,
        });
        return jsonResponse(200, { workflowId, versionId, status: 'PUBLISHED' });
    };
}
async function updateStatus(event, workflowRepo, triggerRepo, auditRepo, status) {
    const tenantId = resolveTenantId(event);
    const workflowId = event.pathParameters?.workflowId;
    if (!tenantId || !workflowId) {
        return jsonResponse(400, { message: 'tenantId and workflowId are required' });
    }
    const workflow = await workflowRepo.getWorkflow(tenantId, workflowId);
    if (!workflow) {
        return jsonResponse(404, { message: 'Workflow not found' });
    }
    if (status === 'PAUSED' && workflow.status !== 'PUBLISHED') {
        return jsonResponse(409, { message: 'Only published workflows can be paused' });
    }
    if (status === 'ARCHIVED' && workflow.status === 'PUBLISHED') {
        return jsonResponse(409, { message: 'Pause the workflow before archiving' });
    }
    if (status === 'PAUSED') {
        await triggerRepo.disableSchedules(workflowId);
    }
    const now = new Date().toISOString();
    await workflowRepo.updateWorkflow({ ...workflow, status, updatedAt: now });
    await auditRepo.write({
        tenantId,
        workflowId,
        actionType: status === 'PAUSED' ? 'WORKFLOW_PAUSED' : 'WORKFLOW_ARCHIVED',
        actor: actor(event),
        timestamp: now,
    });
    return jsonResponse(200, { workflowId, status });
}
export function createPauseWorkflowHandler(workflowRepo, triggerRepo, auditRepo) {
    return (event) => updateStatus(event, workflowRepo, triggerRepo, auditRepo, 'PAUSED');
}
export function createArchiveWorkflowHandler(workflowRepo, triggerRepo, auditRepo) {
    return (event) => updateStatus(event, workflowRepo, triggerRepo, auditRepo, 'ARCHIVED');
}
export function createListWorkflowVersionsHandler(workflowRepo) {
    return async (event) => {
        const workflowId = event.pathParameters?.workflowId;
        if (!workflowId) {
            return jsonResponse(400, { message: 'workflowId is required' });
        }
        const versions = await workflowRepo.listVersions(workflowId);
        const metadataOnly = versions
            .sort((a, b) => compareSemver(b.semver, a.semver))
            .map((version) => ({
            versionId: version.versionId,
            workflowId: version.workflowId,
            semver: version.semver,
            createdBy: version.createdBy,
            createdAt: version.createdAt,
            recipeId: version.recipeId,
        }));
        return jsonResponse(200, { versions: metadataOnly });
    };
}
//# sourceMappingURL=handlers.js.map
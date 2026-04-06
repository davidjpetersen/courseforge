import { describe, expect, it } from 'vitest';
import { createArchiveWorkflowHandler, createCreateWorkflowHandler, createGetWorkflowHandler, createListWorkflowVersionsHandler, createListWorkflowsHandler, createPauseWorkflowHandler, createPublishWorkflowHandler, } from './handlers.js';
// ── Fixtures ──
const TENANT_ID = 'tenant-abc';
const WORKFLOW_ID = 'wf-001';
const VERSION_ID = 'v-001';
const baseStep = {
    stepId: 'step-1',
    name: 'Send Email',
    type: 'action',
    params: { to: 'user@example.com' },
};
const baseWorkflow = {
    PK: `TENANT#${TENANT_ID}`,
    SK: `WORKFLOW#${WORKFLOW_ID}`,
    workflowId: WORKFLOW_ID,
    tenantId: TENANT_ID,
    name: 'My Workflow',
    description: '',
    recipeId: 'recipe-1',
    status: 'DRAFT',
    currentVersionId: VERSION_ID,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    createdBy: 'user-1',
    connectionIds: [],
    environmentId: 'dev',
};
const baseVersion = {
    PK: `WORKFLOW#${WORKFLOW_ID}`,
    SK: 'VERSION#0.1.0',
    versionId: VERSION_ID,
    workflowId: WORKFLOW_ID,
    semver: '0.1.0',
    compiledPlan: [baseStep],
    createdBy: 'user-1',
    createdAt: '2024-01-01T00:00:00Z',
    recipeId: 'recipe-1',
    paramSnapshot: {},
};
const baseRecipe = {
    recipeId: 'recipe-1',
    steps: [
        {
            stepId: 'step-1',
            name: 'Send Email',
            type: 'action',
            params: {},
        },
    ],
};
// ── Helpers ──
function makeWorkflowRepo(workflows = [], versions = [], overrides = {}) {
    return {
        createWorkflow: async () => { },
        updateWorkflow: async () => { },
        getWorkflow: async (tenantId, workflowId) => workflows.find((w) => w.tenantId === tenantId && w.workflowId === workflowId) ?? null,
        listWorkflows: async () => workflows,
        createVersion: async () => { },
        getVersion: async () => versions[0] ?? null,
        listVersions: async () => versions,
        ...overrides,
    };
}
function makeConnectionRepo(connections = []) {
    return {
        listByIds: async () => connections,
    };
}
function makeRecipeRegistry(recipe = baseRecipe) {
    return {
        getById: () => recipe,
    };
}
function makeTriggerRepo(overrides = {}) {
    return {
        hasWebhookSecret: async () => true,
        hasEnabledSchedule: async () => true,
        disableSchedules: async () => { },
        ...overrides,
    };
}
function makeAuditRepo() {
    return { write: async () => { } };
}
function makeEventBridge() {
    return { putEvent: async () => { } };
}
function makeEvent(overrides = {}) {
    return {
        httpMethod: 'POST',
        path: '/api/workflows',
        pathParameters: null,
        queryStringParameters: null,
        headers: { 'x-tenant-id': TENANT_ID },
        body: null,
        ...overrides,
    };
}
function parseBody(body) {
    return JSON.parse(body);
}
// ── Create Workflow ──
describe('POST /api/workflows - Create Workflow', () => {
    const validBody = JSON.stringify({
        name: 'My Workflow',
        recipeId: 'recipe-1',
        environmentId: 'dev',
        connectionIds: [],
        params: {},
    });
    it('returns 201 with workflowId, versionId, and status DRAFT on valid input', async () => {
        const handler = createCreateWorkflowHandler(makeWorkflowRepo(), makeConnectionRepo(), makeRecipeRegistry());
        const result = await handler(makeEvent({ body: validBody }));
        expect(result.statusCode).toBe(201);
        const body = parseBody(result.body);
        expect(typeof body.workflowId).toBe('string');
        expect(typeof body.versionId).toBe('string');
        expect(body.status).toBe('DRAFT');
    });
    it('returns 400 when body is missing', async () => {
        const handler = createCreateWorkflowHandler(makeWorkflowRepo(), makeConnectionRepo(), makeRecipeRegistry());
        const result = await handler(makeEvent({ body: null }));
        expect(result.statusCode).toBe(400);
    });
    it('returns 400 when tenantId is missing', async () => {
        const handler = createCreateWorkflowHandler(makeWorkflowRepo(), makeConnectionRepo(), makeRecipeRegistry());
        const result = await handler(makeEvent({ headers: {}, body: validBody }));
        expect(result.statusCode).toBe(400);
        expect(parseBody(result.body)).toMatchObject({ message: 'tenantId is required' });
    });
    it('returns 400 when name is missing', async () => {
        const handler = createCreateWorkflowHandler(makeWorkflowRepo(), makeConnectionRepo(), makeRecipeRegistry());
        const result = await handler(makeEvent({ body: JSON.stringify({ recipeId: 'r1', environmentId: 'dev', connectionIds: [] }) }));
        expect(result.statusCode).toBe(400);
        expect(parseBody(result.body)).toMatchObject({ message: 'name is required' });
    });
    it('returns 400 when recipeId is unknown', async () => {
        const handler = createCreateWorkflowHandler(makeWorkflowRepo(), makeConnectionRepo(), makeRecipeRegistry(null));
        const result = await handler(makeEvent({ body: validBody }));
        expect(result.statusCode).toBe(400);
        expect(parseBody(result.body)).toMatchObject({ message: 'Unknown recipeId' });
    });
    it('returns 400 when a connection is inactive', async () => {
        const conn = {
            connectionId: 'conn-1',
            tenantId: TENANT_ID,
            status: 'error',
            secretRef: 'arn',
        };
        const handler = createCreateWorkflowHandler(makeWorkflowRepo(), makeConnectionRepo([conn]), makeRecipeRegistry());
        const result = await handler(makeEvent({
            body: JSON.stringify({ name: 'W', recipeId: 'recipe-1', environmentId: 'dev', connectionIds: ['conn-1'] }),
        }));
        expect(result.statusCode).toBe(400);
        expect(parseBody(result.body).message).toContain('not active');
    });
    it('returns 400 on compilation error (missing required param)', async () => {
        const recipeWithRequired = {
            recipeId: 'recipe-1',
            steps: [
                {
                    stepId: 's1',
                    name: 'Step',
                    type: 'action',
                    requiredParams: ['studentId'],
                    params: {},
                },
            ],
        };
        const handler = createCreateWorkflowHandler(makeWorkflowRepo(), makeConnectionRepo(), makeRecipeRegistry(recipeWithRequired));
        const result = await handler(makeEvent({ body: JSON.stringify({ name: 'W', recipeId: 'recipe-1', environmentId: 'dev', connectionIds: [], params: {} }) }));
        expect(result.statusCode).toBe(400);
    });
});
// ── List Workflows ──
describe('GET /api/workflows - List Workflows', () => {
    it('returns 200 with all workflows for the tenant', async () => {
        const handler = createListWorkflowsHandler(makeWorkflowRepo([baseWorkflow]));
        const result = await handler(makeEvent({ httpMethod: 'GET' }));
        expect(result.statusCode).toBe(200);
        const body = parseBody(result.body);
        expect(body.workflows).toHaveLength(1);
    });
    it('returns 400 when tenantId is missing', async () => {
        const handler = createListWorkflowsHandler(makeWorkflowRepo());
        const result = await handler(makeEvent({ httpMethod: 'GET', headers: {} }));
        expect(result.statusCode).toBe(400);
    });
    it('filters by status query parameter', async () => {
        const draft = { ...baseWorkflow, workflowId: 'wf-1', status: 'DRAFT' };
        const published = { ...baseWorkflow, workflowId: 'wf-2', status: 'PUBLISHED' };
        const handler = createListWorkflowsHandler(makeWorkflowRepo([draft, published]));
        const result = await handler(makeEvent({ httpMethod: 'GET', queryStringParameters: { status: 'PUBLISHED' } }));
        expect(result.statusCode).toBe(200);
        const body = parseBody(result.body);
        expect(body.workflows).toHaveLength(1);
        expect(body.workflows[0]?.status).toBe('PUBLISHED');
    });
    it('filters by environmentId query parameter', async () => {
        const dev = { ...baseWorkflow, workflowId: 'wf-1', environmentId: 'dev' };
        const prod = { ...baseWorkflow, workflowId: 'wf-2', environmentId: 'prod' };
        const handler = createListWorkflowsHandler(makeWorkflowRepo([dev, prod]));
        const result = await handler(makeEvent({ httpMethod: 'GET', queryStringParameters: { environmentId: 'prod' } }));
        expect(result.statusCode).toBe(200);
        const body = parseBody(result.body);
        expect(body.workflows).toHaveLength(1);
        expect(body.workflows[0]?.environmentId).toBe('prod');
    });
    it('applies both status and environmentId filters together', async () => {
        const workflows = [
            { ...baseWorkflow, workflowId: 'wf-1', status: 'DRAFT', environmentId: 'dev' },
            { ...baseWorkflow, workflowId: 'wf-2', status: 'PUBLISHED', environmentId: 'dev' },
            { ...baseWorkflow, workflowId: 'wf-3', status: 'DRAFT', environmentId: 'prod' },
        ];
        const handler = createListWorkflowsHandler(makeWorkflowRepo(workflows));
        const result = await handler(makeEvent({ httpMethod: 'GET', queryStringParameters: { status: 'DRAFT', environmentId: 'dev' } }));
        expect(result.statusCode).toBe(200);
        const body = parseBody(result.body);
        expect(body.workflows).toHaveLength(1);
        expect(body.workflows[0]?.workflowId).toBe('wf-1');
    });
});
// ── Get Workflow ──
describe('GET /api/workflows/:workflowId - Get Workflow', () => {
    it('returns 200 with workflow and currentVersionSummary', async () => {
        const handler = createGetWorkflowHandler(makeWorkflowRepo([baseWorkflow], [baseVersion]));
        const result = await handler(makeEvent({ httpMethod: 'GET', pathParameters: { workflowId: WORKFLOW_ID } }));
        expect(result.statusCode).toBe(200);
        const body = parseBody(result.body);
        expect(body.workflow.workflowId).toBe(WORKFLOW_ID);
        expect(body.currentVersionSummary).toEqual(['Send Email']);
    });
    it('returns 404 when workflow does not exist', async () => {
        const handler = createGetWorkflowHandler(makeWorkflowRepo([], []));
        const result = await handler(makeEvent({ httpMethod: 'GET', pathParameters: { workflowId: 'nonexistent' } }));
        expect(result.statusCode).toBe(404);
        expect(parseBody(result.body)).toMatchObject({ message: 'Workflow not found' });
    });
    it('returns 400 when tenantId is missing', async () => {
        const handler = createGetWorkflowHandler(makeWorkflowRepo([baseWorkflow]));
        const result = await handler(makeEvent({ httpMethod: 'GET', headers: {}, pathParameters: { workflowId: WORKFLOW_ID } }));
        expect(result.statusCode).toBe(400);
    });
    it('returns 400 when workflowId is missing', async () => {
        const handler = createGetWorkflowHandler(makeWorkflowRepo([baseWorkflow]));
        const result = await handler(makeEvent({ httpMethod: 'GET', pathParameters: null }));
        expect(result.statusCode).toBe(400);
    });
});
// ── Publish Workflow ──
describe('POST /api/workflows/:workflowId/publish - Publish Workflow', () => {
    function makePublishHandler(workflow, versions, triggerOverrides = {}) {
        return createPublishWorkflowHandler(makeWorkflowRepo(workflow ? [workflow] : [], versions), makeConnectionRepo(), makeTriggerRepo(triggerOverrides), makeAuditRepo(), makeEventBridge());
    }
    it('returns 200 with new versionId and status PUBLISHED when publishing from DRAFT', async () => {
        const handler = makePublishHandler(baseWorkflow, [baseVersion]);
        const result = await handler(makeEvent({ pathParameters: { workflowId: WORKFLOW_ID } }));
        expect(result.statusCode).toBe(200);
        const body = parseBody(result.body);
        expect(body.status).toBe('PUBLISHED');
        expect(typeof body.versionId).toBe('string');
    });
    it('returns 200 when re-publishing from PAUSED', async () => {
        const paused = { ...baseWorkflow, status: 'PAUSED' };
        const handler = makePublishHandler(paused, [baseVersion]);
        const result = await handler(makeEvent({ pathParameters: { workflowId: WORKFLOW_ID } }));
        expect(result.statusCode).toBe(200);
        expect(parseBody(result.body).status).toBe('PUBLISHED');
    });
    it('returns 409 when workflow is already published', async () => {
        const published = { ...baseWorkflow, status: 'PUBLISHED' };
        const handler = makePublishHandler(published, [baseVersion]);
        const result = await handler(makeEvent({ pathParameters: { workflowId: WORKFLOW_ID } }));
        expect(result.statusCode).toBe(409);
        expect(parseBody(result.body)).toMatchObject({ message: 'Workflow is already published' });
    });
    it('returns 404 when workflow does not exist', async () => {
        const handler = makePublishHandler(null, []);
        const result = await handler(makeEvent({ pathParameters: { workflowId: WORKFLOW_ID } }));
        expect(result.statusCode).toBe(404);
    });
    it('returns 400 when webhook trigger lacks a webhook secret', async () => {
        const versionWithWebhook = {
            ...baseVersion,
            compiledPlan: [{ stepId: 's1', name: 'Trigger', type: 'trigger', params: { triggerType: 'webhook' } }],
        };
        const handler = makePublishHandler(baseWorkflow, [versionWithWebhook], {
            hasWebhookSecret: async () => false,
        });
        const result = await handler(makeEvent({ pathParameters: { workflowId: WORKFLOW_ID } }));
        expect(result.statusCode).toBe(400);
        expect(parseBody(result.body).message).toContain('webhook secret');
    });
    it('returns 400 when scheduled trigger lacks an enabled schedule', async () => {
        const versionWithSchedule = {
            ...baseVersion,
            compiledPlan: [{ stepId: 's1', name: 'Trigger', type: 'trigger', params: { triggerType: 'scheduled' } }],
        };
        const handler = makePublishHandler(baseWorkflow, [versionWithSchedule], {
            hasEnabledSchedule: async () => false,
        });
        const result = await handler(makeEvent({ pathParameters: { workflowId: WORKFLOW_ID } }));
        expect(result.statusCode).toBe(400);
        expect(parseBody(result.body).message).toContain('schedule');
    });
    it('returns 400 when a connection is no longer active', async () => {
        const workflowWithConn = { ...baseWorkflow, connectionIds: ['conn-1'] };
        const inactiveConn = { connectionId: 'conn-1', tenantId: TENANT_ID, status: 'error', secretRef: 'arn' };
        const handler = createPublishWorkflowHandler(makeWorkflowRepo([workflowWithConn], [baseVersion]), makeConnectionRepo([inactiveConn]), makeTriggerRepo(), makeAuditRepo(), makeEventBridge());
        const result = await handler(makeEvent({ pathParameters: { workflowId: WORKFLOW_ID } }));
        expect(result.statusCode).toBe(400);
    });
});
// ── Pause Workflow ──
describe('POST /api/workflows/:workflowId/pause - Pause Workflow', () => {
    let schedulesDisabled = false;
    function makePauseHandler(workflow) {
        schedulesDisabled = false;
        return createPauseWorkflowHandler(makeWorkflowRepo(workflow ? [workflow] : []), makeTriggerRepo({ disableSchedules: async () => { schedulesDisabled = true; } }), makeAuditRepo());
    }
    it('returns 200 with status PAUSED for a published workflow', async () => {
        const published = { ...baseWorkflow, status: 'PUBLISHED' };
        const handler = makePauseHandler(published);
        const result = await handler(makeEvent({ pathParameters: { workflowId: WORKFLOW_ID } }));
        expect(result.statusCode).toBe(200);
        expect(parseBody(result.body).status).toBe('PAUSED');
    });
    it('disables schedules when pausing', async () => {
        const published = { ...baseWorkflow, status: 'PUBLISHED' };
        const handler = makePauseHandler(published);
        await handler(makeEvent({ pathParameters: { workflowId: WORKFLOW_ID } }));
        expect(schedulesDisabled).toBe(true);
    });
    it('returns 409 when workflow is not published', async () => {
        const handler = makePauseHandler(baseWorkflow); // DRAFT status
        const result = await handler(makeEvent({ pathParameters: { workflowId: WORKFLOW_ID } }));
        expect(result.statusCode).toBe(409);
        expect(parseBody(result.body)).toMatchObject({ message: 'Only published workflows can be paused' });
    });
    it('returns 404 when workflow does not exist', async () => {
        const handler = makePauseHandler(null);
        const result = await handler(makeEvent({ pathParameters: { workflowId: WORKFLOW_ID } }));
        expect(result.statusCode).toBe(404);
    });
    it('returns 400 when tenantId is missing', async () => {
        const handler = makePauseHandler(baseWorkflow);
        const result = await handler(makeEvent({ headers: {}, pathParameters: { workflowId: WORKFLOW_ID } }));
        expect(result.statusCode).toBe(400);
    });
});
// ── Archive Workflow ──
describe('POST /api/workflows/:workflowId/archive - Archive Workflow', () => {
    function makeArchiveHandler(workflow) {
        return createArchiveWorkflowHandler(makeWorkflowRepo(workflow ? [workflow] : []), makeTriggerRepo(), makeAuditRepo());
    }
    it('returns 200 with status ARCHIVED for a DRAFT workflow', async () => {
        const handler = makeArchiveHandler(baseWorkflow); // DRAFT
        const result = await handler(makeEvent({ pathParameters: { workflowId: WORKFLOW_ID } }));
        expect(result.statusCode).toBe(200);
        expect(parseBody(result.body).status).toBe('ARCHIVED');
    });
    it('returns 200 with status ARCHIVED for a PAUSED workflow', async () => {
        const paused = { ...baseWorkflow, status: 'PAUSED' };
        const handler = makeArchiveHandler(paused);
        const result = await handler(makeEvent({ pathParameters: { workflowId: WORKFLOW_ID } }));
        expect(result.statusCode).toBe(200);
        expect(parseBody(result.body).status).toBe('ARCHIVED');
    });
    it('returns 409 when workflow is PUBLISHED (must pause first)', async () => {
        const published = { ...baseWorkflow, status: 'PUBLISHED' };
        const handler = makeArchiveHandler(published);
        const result = await handler(makeEvent({ pathParameters: { workflowId: WORKFLOW_ID } }));
        expect(result.statusCode).toBe(409);
        expect(parseBody(result.body)).toMatchObject({ message: 'Pause the workflow before archiving' });
    });
    it('returns 404 when workflow does not exist', async () => {
        const handler = makeArchiveHandler(null);
        const result = await handler(makeEvent({ pathParameters: { workflowId: WORKFLOW_ID } }));
        expect(result.statusCode).toBe(404);
    });
});
// ── List Workflow Versions ──
describe('GET /api/workflows/:workflowId/versions - List Workflow Versions', () => {
    it('returns 200 with versions sorted by semver descending', async () => {
        const v010 = { ...baseVersion, semver: '0.1.0', SK: 'VERSION#0.1.0' };
        const v020 = { ...baseVersion, versionId: 'v2', semver: '0.2.0', SK: 'VERSION#0.2.0' };
        const v011 = { ...baseVersion, versionId: 'v3', semver: '0.1.1', SK: 'VERSION#0.1.1' };
        const handler = createListWorkflowVersionsHandler(makeWorkflowRepo([baseWorkflow], [v010, v020, v011]));
        const result = await handler(makeEvent({ httpMethod: 'GET', pathParameters: { workflowId: WORKFLOW_ID } }));
        expect(result.statusCode).toBe(200);
        const body = parseBody(result.body);
        expect(body.versions.map((v) => v.semver)).toEqual(['0.2.0', '0.1.1', '0.1.0']);
    });
    it('excludes compiledPlan and paramSnapshot from response', async () => {
        const handler = createListWorkflowVersionsHandler(makeWorkflowRepo([baseWorkflow], [baseVersion]));
        const result = await handler(makeEvent({ httpMethod: 'GET', pathParameters: { workflowId: WORKFLOW_ID } }));
        expect(result.statusCode).toBe(200);
        const body = parseBody(result.body);
        expect(body.versions[0]).not.toHaveProperty('compiledPlan');
        expect(body.versions[0]).not.toHaveProperty('paramSnapshot');
    });
    it('returns 400 when workflowId is missing', async () => {
        const handler = createListWorkflowVersionsHandler(makeWorkflowRepo());
        const result = await handler(makeEvent({ httpMethod: 'GET', pathParameters: null }));
        expect(result.statusCode).toBe(400);
    });
});
//# sourceMappingURL=handlers.test.js.map
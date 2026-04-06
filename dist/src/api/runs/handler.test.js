import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRunsHandler } from './handler.js';
import { encodeCursor } from './validation.js';
function makeEvent(overrides = {}) {
    return {
        httpMethod: 'GET',
        path: '/api/runs',
        headers: { 'x-tenant-id': 'tenant-1' },
        queryStringParameters: null,
        ...overrides,
    };
}
function makeMockRepo() {
    return {
        queryByTenant: vi.fn().mockResolvedValue({ items: [], lastKey: undefined }),
        queryByWorkflow: vi.fn().mockResolvedValue({ items: [], lastKey: undefined }),
        queryByTenantStatus: vi.fn().mockResolvedValue({ items: [], lastKey: undefined }),
        getById: vi.fn().mockResolvedValue(null),
        getSteps: vi.fn().mockResolvedValue([]),
    };
}
describe('createRunsHandler', () => {
    let mockRepo;
    beforeEach(() => {
        mockRepo = makeMockRepo();
    });
    it('routes to queryByWorkflow when workflowId query param is provided', async () => {
        const handler = createRunsHandler(mockRepo);
        const event = makeEvent({ queryStringParameters: { workflowId: 'wf-1' } });
        const response = await handler(event);
        expect(response.statusCode).toBe(200);
        expect(mockRepo.queryByWorkflow).toHaveBeenCalledWith('wf-1', expect.objectContaining({ workflowId: 'wf-1' }));
        expect(mockRepo.queryByTenant).not.toHaveBeenCalled();
        expect(mockRepo.queryByTenantStatus).not.toHaveBeenCalled();
    });
    it('routes to queryByTenantStatus when status query param is provided', async () => {
        const handler = createRunsHandler(mockRepo);
        const event = makeEvent({ queryStringParameters: { status: 'SUCCESS' } });
        const response = await handler(event);
        expect(response.statusCode).toBe(200);
        expect(mockRepo.queryByTenantStatus).toHaveBeenCalledWith('tenant-1', 'SUCCESS', expect.objectContaining({ status: 'SUCCESS' }));
        expect(mockRepo.queryByTenant).not.toHaveBeenCalled();
        expect(mockRepo.queryByWorkflow).not.toHaveBeenCalled();
    });
    it('routes to queryByTenant when neither workflowId nor status is provided', async () => {
        const handler = createRunsHandler(mockRepo);
        const event = makeEvent();
        const response = await handler(event);
        expect(response.statusCode).toBe(200);
        expect(mockRepo.queryByTenant).toHaveBeenCalledWith('tenant-1', expect.any(Object));
        expect(mockRepo.queryByWorkflow).not.toHaveBeenCalled();
        expect(mockRepo.queryByTenantStatus).not.toHaveBeenCalled();
    });
    it('returns 400 when tenantId header is missing', async () => {
        const handler = createRunsHandler(mockRepo);
        const event = makeEvent({ headers: {} });
        const response = await handler(event);
        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.message).toBeDefined();
    });
    it('returns 400 for invalid params (e.g. status=INVALID)', async () => {
        const handler = createRunsHandler(mockRepo);
        const event = makeEvent({ queryStringParameters: { status: 'INVALID' } });
        const response = await handler(event);
        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.message).toMatch(/status/i);
        expect(mockRepo.queryByTenant).not.toHaveBeenCalled();
    });
    it('returns nextCursor when lastKey is present in result', async () => {
        const lastKey = { runId: 'run-42', tenantId: 'tenant-1' };
        mockRepo.queryByTenant.mockResolvedValue({ items: [], lastKey });
        const handler = createRunsHandler(mockRepo);
        const response = await handler(makeEvent());
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.nextCursor).toBe(encodeCursor(lastKey));
    });
    it('returns no nextCursor when lastKey is absent', async () => {
        const handler = createRunsHandler(mockRepo);
        const response = await handler(makeEvent());
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.nextCursor).toBeUndefined();
    });
});
//# sourceMappingURL=handler.test.js.map
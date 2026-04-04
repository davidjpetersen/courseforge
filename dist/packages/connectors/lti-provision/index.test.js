import { describe, expect, it, vi } from 'vitest';
import { ltiProvisionConnector } from './index.js';
describe('lti-provision result normalization', () => {
    it('normalizes Canvas validation response', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: 'name is required' }] }), {
            status: 422,
        })));
        const result = await ltiProvisionConnector.run({
            lmsType: 'canvas',
            baseUrl: 'https://canvas.example',
            apiKey: 'api',
            courseId: '42',
            toolClientId: 'client',
            toolName: 'CourseForge',
            launchUrl: 'https://tool.example/launch',
        }, { tenantId: 'tenant-1', runId: 'run-1' });
        expect(result.success).toBe(false);
        expect(result.message).toContain('name is required');
        vi.unstubAllGlobals();
    });
    it('normalizes Blackboard API errors', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'BB_400', message: 'invalid placement' }), {
            status: 400,
        })));
        await expect(ltiProvisionConnector.run({
            lmsType: 'blackboard',
            baseUrl: 'https://bb.example',
            apiKey: 'api',
            courseId: '42',
            toolClientId: 'client',
            toolName: 'CourseForge',
            launchUrl: 'https://tool.example/launch',
        }, { tenantId: 'tenant-1', runId: 'run-1' })).rejects.toThrow('BB_400: invalid placement');
        vi.unstubAllGlobals();
    });
    it('normalizes Brightspace API errors', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ErrorCode: 'D2L_401', Message: 'unauthorized' }), {
            status: 401,
        })));
        await expect(ltiProvisionConnector.run({
            lmsType: 'brightspace',
            baseUrl: 'https://d2l.example',
            apiKey: 'api',
            courseId: '42',
            toolClientId: 'client-secret',
            toolName: 'CourseForge',
            launchUrl: 'https://tool.example/launch',
        }, { tenantId: 'tenant-1', runId: 'run-1' })).rejects.toThrow('D2L_401: unauthorized');
        vi.unstubAllGlobals();
    });
});
//# sourceMappingURL=index.test.js.map
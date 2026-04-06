import { jsonResponse, resolveTenantId } from '../triggers/shared.js';
import { validateRunsQueryParams, encodeCursor } from './validation.js';
export function createRunsHandler(repo) {
    return async (event) => {
        const tenantId = resolveTenantId(event);
        if (tenantId === null) {
            return jsonResponse(400, { message: 'Missing x-tenant-id header' });
        }
        const raw = event.queryStringParameters ?? {};
        const validation = validateRunsQueryParams(raw);
        if (!validation.valid) {
            return jsonResponse(400, { message: validation.errors.join(', ') });
        }
        const params = validation.parsed;
        let result;
        if (params.workflowId !== undefined) {
            result = await repo.queryByWorkflow(params.workflowId, params);
        }
        else if (params.status !== undefined) {
            result = await repo.queryByTenantStatus(tenantId, params.status, params);
        }
        else {
            result = await repo.queryByTenant(tenantId, params);
        }
        const response = { runs: result.items };
        if (result.lastKey !== undefined) {
            response.nextCursor = encodeCursor(result.lastKey);
        }
        return jsonResponse(200, response);
    };
}
//# sourceMappingURL=handler.js.map
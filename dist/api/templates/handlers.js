/**
 * Lambda handlers for the Template API.
 *
 * GET /templates           — list all templates, optional ?category= filter
 * GET /templates/{templateId} — get template detail with missing connections
 */
import { buildListResponse, buildDetailResponse, } from './logic.js';
// ── Response helpers ──
const JSON_HEADERS = { 'Content-Type': 'application/json' };
function jsonResponse(statusCode, body) {
    return {
        statusCode,
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
    };
}
// ── GET /templates ──
export function createListTemplatesHandler(repo) {
    return async (event) => {
        try {
            const categoryParam = event.queryStringParameters?.category ?? '';
            const selectedCategories = categoryParam
                ? categoryParam.split(',').map((c) => c.trim()).filter(Boolean)
                : [];
            const allTemplates = await repo.listAll();
            const response = buildListResponse(allTemplates, selectedCategories);
            return jsonResponse(200, response);
        }
        catch (error) {
            console.error('Error listing templates:', error);
            return jsonResponse(500, { message: 'Internal server error' });
        }
    };
}
// ── GET /templates/{templateId} ──
export function createGetTemplateHandler(repo, connectionProvider) {
    return async (event) => {
        try {
            const templateId = event.pathParameters?.templateId;
            if (!templateId) {
                return jsonResponse(400, { message: 'Missing templateId path parameter' });
            }
            const template = await repo.getById(templateId);
            if (!template) {
                return jsonResponse(404, { message: 'Template not found' });
            }
            // tenantId comes from auth context; fall back to query param for now
            const tenantId = event.queryStringParameters?.tenantId ?? 'default-tenant';
            const configuredConnections = await connectionProvider.getConfiguredConnections(tenantId);
            const response = buildDetailResponse(template, configuredConnections);
            return jsonResponse(200, response);
        }
        catch (error) {
            console.error('Error getting template:', error);
            return jsonResponse(500, { message: 'Internal server error' });
        }
    };
}
//# sourceMappingURL=handlers.js.map
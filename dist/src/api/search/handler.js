/**
 * Lambda handler for the Search API.
 *
 * GET /search?q={query}&category={cat1,cat2}  — Full-text search with optional category filter
 *
 * The OpenSearch client is abstracted behind an interface so the handler
 * can be tested with in-memory implementations.
 */
import { buildSearchResponse } from './logic.js';
// ── Response helpers ──
const JSON_HEADERS = { 'Content-Type': 'application/json' };
function jsonResponse(statusCode, body) {
    return {
        statusCode,
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
    };
}
// ── GET /search ──
export function createSearchHandler(client) {
    return async (event) => {
        try {
            const query = event.queryStringParameters?.q ?? '';
            const categoryParam = event.queryStringParameters?.category ?? '';
            const categories = categoryParam
                ? categoryParam.split(',').map((c) => c.trim()).filter(Boolean)
                : [];
            const allTemplates = await client.listAll();
            const response = buildSearchResponse(allTemplates, query, categories);
            return jsonResponse(200, response);
        }
        catch (error) {
            console.error('Error searching templates:', error);
            return jsonResponse(503, {
                message: 'Search service temporarily unavailable',
            });
        }
    };
}
//# sourceMappingURL=handler.js.map
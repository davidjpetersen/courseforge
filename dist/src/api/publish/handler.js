/**
 * Lambda handler for the Publish API.
 *
 * POST /workflows — validates request, triggers Step Functions publish pipeline,
 * and returns the created workflow details.
 */
// ── Response helpers ──
const JSON_HEADERS = { 'Content-Type': 'application/json' };
function jsonResponse(statusCode, body) {
    return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}
// ── Request validation ──
export function validatePublishRequest(body) {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return 'Request body must be a JSON object';
    }
    const obj = body;
    if (typeof obj.templateId !== 'string' || obj.templateId.trim() === '') {
        return 'templateId is required and must be a non-empty string';
    }
    if (typeof obj.tenantId !== 'string' || obj.tenantId.trim() === '') {
        return 'tenantId is required and must be a non-empty string';
    }
    if (typeof obj.name !== 'string' || obj.name.trim() === '') {
        return 'name is required and must be a non-empty string';
    }
    if (typeof obj.configuration !== 'object' ||
        obj.configuration === null ||
        Array.isArray(obj.configuration)) {
        return 'configuration is required and must be an object';
    }
    return {
        templateId: obj.templateId,
        tenantId: obj.tenantId,
        name: obj.name,
        configuration: obj.configuration,
    };
}
// ── Build first-run monitoring URL ──
export function buildFirstRunUrl(workflowId, tenantId) {
    return `/tenants/${tenantId}/workflows/${workflowId}/runs/latest`;
}
// ── Handler factory ──
export function createPublishHandler(sfnClient) {
    return async (event) => {
        try {
            // Parse body
            if (!event.body) {
                return jsonResponse(400, { message: 'Request body is required' });
            }
            let parsed;
            try {
                parsed = JSON.parse(event.body);
            }
            catch {
                return jsonResponse(400, { message: 'Invalid JSON in request body' });
            }
            const validated = validatePublishRequest(parsed);
            if (typeof validated === 'string') {
                return jsonResponse(400, { message: validated });
            }
            // Trigger Step Functions publish pipeline
            const workflow = await sfnClient.startPublishPipeline(validated);
            const response = {
                workflowId: workflow.workflowId,
                status: 'active',
                name: workflow.name,
                firstRunUrl: buildFirstRunUrl(workflow.workflowId, workflow.tenantId),
            };
            return jsonResponse(200, response);
        }
        catch (error) {
            console.error('Error publishing workflow:', error);
            const message = error instanceof Error ? error.message : 'Internal server error';
            return jsonResponse(500, { message });
        }
    };
}
//# sourceMappingURL=handler.js.map
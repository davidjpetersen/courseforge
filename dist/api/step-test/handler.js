/**
 * Lambda handler for the Step Test API.
 *
 * POST /steps/{stepId}/test — dry-run validation against connected system.
 */
// ── Response helpers ──
const JSON_HEADERS = { 'Content-Type': 'application/json' };
function jsonResponse(statusCode, body) {
    return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}
// ── Request validation ──
export function validateStepTestRequest(body) {
    if (typeof body !== 'object' || body === null) {
        return 'Request body must be a JSON object';
    }
    const obj = body;
    if (typeof obj.templateId !== 'string' || obj.templateId.trim() === '') {
        return 'templateId is required and must be a non-empty string';
    }
    if (typeof obj.stepIndex !== 'number' || !Number.isInteger(obj.stepIndex) || obj.stepIndex < 0) {
        return 'stepIndex is required and must be a non-negative integer';
    }
    if (typeof obj.configuration !== 'object' || obj.configuration === null || Array.isArray(obj.configuration)) {
        return 'configuration is required and must be an object';
    }
    return {
        templateId: obj.templateId,
        stepIndex: obj.stepIndex,
        configuration: obj.configuration,
    };
}
// ── Handler factory ──
export function createStepTestHandler(templateProvider, systemClient) {
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
            const validated = validateStepTestRequest(parsed);
            if (typeof validated === 'string') {
                return jsonResponse(400, { message: validated });
            }
            // Look up connected system for the step
            const connectedSystem = await templateProvider.getConnectedSystemForStep(validated.templateId, validated.stepIndex);
            if (!connectedSystem) {
                return jsonResponse(400, {
                    message: 'Step does not reference a connected system and cannot be tested',
                });
            }
            // Execute dry-run
            const result = await systemClient.dryRun(connectedSystem, validated.configuration);
            return jsonResponse(200, result);
        }
        catch (error) {
            console.error('Error testing step:', error);
            return jsonResponse(500, { message: 'Internal server error' });
        }
    };
}
//# sourceMappingURL=handler.js.map
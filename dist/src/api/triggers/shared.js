export const JSON_HEADERS = { 'Content-Type': 'application/json' };
export function jsonResponse(statusCode, body) {
    return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}
export function getHeader(headers, name) {
    if (!headers) {
        return undefined;
    }
    const match = Object.entries(headers).find(([headerName]) => headerName.toLowerCase() === name.toLowerCase());
    return match?.[1];
}
export function parseJsonBody(body) {
    if (!body) {
        return new Error('Request body is required');
    }
    try {
        return JSON.parse(body);
    }
    catch {
        return new Error('Invalid JSON in request body');
    }
}
export function resolveTenantId(event, parsedBody) {
    const headerTenantId = getHeader(event.headers, 'x-tenant-id');
    if (typeof headerTenantId === 'string' && headerTenantId.trim() !== '') {
        return headerTenantId.trim();
    }
    if (typeof parsedBody?.tenantId === 'string' && parsedBody.tenantId.trim() !== '') {
        return parsedBody.tenantId.trim();
    }
    return null;
}
//# sourceMappingURL=shared.js.map
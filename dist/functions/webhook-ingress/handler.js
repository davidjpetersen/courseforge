import { createHash, randomUUID } from 'node:crypto';
import { runSK, tenantPK, webhookSecretSK, workflowMetaSK, workflowPK, } from '../../src/models/schema.js';
import { RunStatus, TRIGGER_EVENT_TYPES, WorkflowStatus, } from '../../packages/types/src/index.js';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
function jsonResponse(statusCode, body) {
    return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}
function getHeader(headers, name) {
    if (!headers) {
        return undefined;
    }
    const match = Object.entries(headers).find(([headerName]) => headerName.toLowerCase() === name.toLowerCase());
    return match?.[1];
}
export function parseAuthorizationHeader(authorizationHeader) {
    if (!authorizationHeader) {
        return null;
    }
    const bearerMatch = authorizationHeader.match(/^Bearer\s+([^:]+):(.+)$/i);
    if (!bearerMatch) {
        return null;
    }
    const [, tenantId, token] = bearerMatch;
    if (!tenantId || !token) {
        return null;
    }
    return { tenantId, token };
}
function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}
export function createWebhookIngressHandler(deps) {
    const now = deps.clock ?? (() => new Date());
    const makeUuid = deps.uuid ?? randomUUID;
    return async (event) => {
        const workflowId = event.pathParameters?.workflowId;
        if (!workflowId) {
            return jsonResponse(400, { message: 'workflowId path parameter is required' });
        }
        const auth = parseAuthorizationHeader(getHeader(event.headers, 'authorization'));
        if (!auth) {
            return jsonResponse(401, { message: 'Authorization header is required' });
        }
        const secret = await deps.dynamoClient.get({
            TableName: deps.mainTableName,
            Key: {
                PK: tenantPK(auth.tenantId),
                SK: webhookSecretSK(workflowId),
            },
        });
        if (!secret.Item || secret.Item.tokenHash !== sha256(auth.token)) {
            return jsonResponse(401, { message: 'Unauthorized' });
        }
        const workflow = await deps.dynamoClient.get({
            TableName: deps.mainTableName,
            Key: {
                PK: workflowPK(workflowId),
                SK: workflowMetaSK(),
            },
        });
        if (!workflow.Item ||
            workflow.Item.status !== WorkflowStatus.PUBLISHED ||
            workflow.Item.tenantId !== auth.tenantId) {
            return jsonResponse(409, {
                message: 'Workflow is not in a triggerable state',
            });
        }
        if (!event.body) {
            return jsonResponse(400, { message: 'Request body is required' });
        }
        let payload;
        try {
            payload = JSON.parse(event.body);
        }
        catch {
            return jsonResponse(400, { message: 'Invalid JSON in request body' });
        }
        const timestamp = now().toISOString();
        const traceId = makeUuid();
        const runId = makeUuid();
        const domainEvent = {
            tenantId: auth.tenantId,
            workflowId,
            eventType: TRIGGER_EVENT_TYPES.WEBHOOK_RECEIVED,
            payload,
            traceId,
            timestamp,
        };
        await deps.eventBridgeClient.putEvents({
            Entries: [
                {
                    EventBusName: deps.eventBusName,
                    Source: 'courseforge.trigger',
                    DetailType: TRIGGER_EVENT_TYPES.WEBHOOK_RECEIVED,
                    Detail: JSON.stringify(domainEvent),
                },
            ],
        });
        await deps.dynamoClient.put({
            TableName: deps.mainTableName,
            Item: {
                PK: tenantPK(auth.tenantId),
                SK: runSK(timestamp, runId),
                tenantId: auth.tenantId,
                workflowId,
                runId,
                traceId,
                triggerType: 'webhook',
                status: RunStatus.PENDING,
                startedAt: timestamp,
                createdAt: timestamp,
            },
        });
        return jsonResponse(202, { runId, traceId });
    };
}
//# sourceMappingURL=handler.js.map
import { randomUUID } from 'node:crypto';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
function jsonResponse(statusCode, body) {
    return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}
export function createReplayRunHandler(deps) {
    const now = deps.clock ?? (() => new Date());
    const makeUuid = deps.uuid ?? randomUUID;
    return async (request) => {
        const runId = request.pathParameters?.runId;
        if (!runId) {
            return jsonResponse(400, { message: 'runId path parameter is required' });
        }
        const run = await deps.getRun(runId);
        if (!run) {
            return jsonResponse(404, { message: 'Run not found' });
        }
        if (run.status !== 'FAILED') {
            return jsonResponse(422, { message: 'Only FAILED runs can be replayed' });
        }
        const newRunId = makeUuid();
        const createdAt = now().toISOString();
        await deps.createRun({
            PK: `RUN#${newRunId}`,
            SK: 'META',
            runId: newRunId,
            tenantId: run.tenantId,
            workflowId: run.workflowId,
            status: 'PENDING',
            triggerType: 'replay',
            parentRunId: runId,
            payload: run.payload,
            createdAt,
        });
        await deps.eventBridgeClient.putEvents({
            Entries: [
                {
                    EventBusName: deps.eventBusName,
                    Source: 'courseforge.trigger',
                    DetailType: 'RunReplayed',
                    Detail: JSON.stringify({
                        tenantId: run.tenantId,
                        workflowId: run.workflowId,
                        runId: newRunId,
                        parentRunId: runId,
                        payload: run.payload,
                    }),
                },
            ],
        });
        return jsonResponse(200, { newRunId, parentRunId: runId });
    };
}
//# sourceMappingURL=replay.js.map
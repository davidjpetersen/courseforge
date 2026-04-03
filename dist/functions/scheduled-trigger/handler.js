import { randomUUID } from 'node:crypto';
import { runSK, schedulePK, scheduleSK, tenantPK, workflowMetaSK, workflowPK, } from '../../src/models/schema.js';
import { RunStatus, TRIGGER_EVENT_TYPES, WorkflowStatus, } from '../../packages/types/src/index.js';
export function createScheduledTriggerHandler(deps) {
    const now = deps.clock ?? (() => new Date());
    const makeUuid = deps.uuid ?? randomUUID;
    const logger = deps.logger ?? console;
    return async (event) => {
        const workflow = await deps.dynamoClient.get({
            TableName: deps.mainTableName,
            Key: {
                PK: workflowPK(event.workflowId),
                SK: workflowMetaSK(),
            },
        });
        if (!workflow.Item ||
            workflow.Item.status !== WorkflowStatus.PUBLISHED ||
            workflow.Item.tenantId !== event.tenantId) {
            logger.warn(`Skipping scheduled trigger for workflow ${event.workflowId}: workflow is not published`);
            return;
        }
        const timestamp = now().toISOString();
        const traceId = makeUuid();
        const runId = makeUuid();
        const domainEvent = {
            tenantId: event.tenantId,
            workflowId: event.workflowId,
            eventType: TRIGGER_EVENT_TYPES.SCHEDULE_TRIGGERED,
            payload: { scheduleId: event.scheduleId },
            traceId,
            timestamp,
        };
        await deps.eventBridgeClient.putEvents({
            Entries: [
                {
                    EventBusName: deps.eventBusName,
                    Source: 'courseforge.trigger',
                    DetailType: TRIGGER_EVENT_TYPES.SCHEDULE_TRIGGERED,
                    Detail: JSON.stringify(domainEvent),
                },
            ],
        });
        await deps.dynamoClient.put({
            TableName: deps.mainTableName,
            Item: {
                PK: tenantPK(event.tenantId),
                SK: runSK(timestamp, runId),
                tenantId: event.tenantId,
                workflowId: event.workflowId,
                runId,
                traceId,
                triggerType: 'scheduled',
                status: RunStatus.PENDING,
                startedAt: timestamp,
                createdAt: timestamp,
                scheduleId: event.scheduleId,
            },
        });
        await deps.dynamoClient.update({
            TableName: deps.schedulesTableName,
            Key: {
                PK: schedulePK(event.workflowId),
                SK: scheduleSK(event.scheduleId),
            },
            UpdateExpression: 'SET lastRunAt = :lastRunAt, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':lastRunAt': timestamp,
                ':updatedAt': timestamp,
            },
        });
    };
}
//# sourceMappingURL=handler.js.map
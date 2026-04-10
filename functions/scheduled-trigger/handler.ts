import { randomUUID } from 'node:crypto';

import {
  runSK,
  schedulePK,
  scheduleSK,
  tenantPK,
  workflowMetaSK,
  workflowPK,
} from '../../src/models/schema';
import {
  RunStatus,
  TRIGGER_EVENT_TYPES,
  WorkflowStatus,
  type DomainEvent,
} from '../../packages/types/src/index';

export interface ScheduledTriggerEvent {
  workflowId: string;
  tenantId: string;
  scheduleId: string;
}

export interface DynamoClientLike {
  get(params: {
    TableName: string;
    Key: Record<string, unknown>;
  }): Promise<{ Item?: Record<string, unknown> }>;
  put(params: { TableName: string; Item: Record<string, unknown> }): Promise<unknown>;
  update(params: {
    TableName: string;
    Key: Record<string, unknown>;
    UpdateExpression: string;
    ExpressionAttributeValues?: Record<string, unknown>;
  }): Promise<unknown>;
}

export interface EventBridgeClientLike {
  putEvents(params: {
    Entries: Array<{
      EventBusName: string;
      Source: string;
      DetailType: string;
      Detail: string;
    }>;
  }): Promise<unknown>;
}

export interface ScheduledTriggerDeps {
  dynamoClient: DynamoClientLike;
  eventBridgeClient: EventBridgeClientLike;
  mainTableName: string;
  schedulesTableName: string;
  eventBusName: string;
  clock?: () => Date;
  uuid?: () => string;
  logger?: Pick<Console, 'warn'>;
}

export function createScheduledTriggerHandler(deps: ScheduledTriggerDeps) {
  const now = deps.clock ?? (() => new Date());
  const makeUuid = deps.uuid ?? randomUUID;
  const logger = deps.logger ?? console;

  return async (event: ScheduledTriggerEvent): Promise<void> => {
    const workflow = await deps.dynamoClient.get({
      TableName: deps.mainTableName,
      Key: {
        PK: workflowPK(event.workflowId),
        SK: workflowMetaSK(),
      },
    });

    if (
      !workflow.Item ||
      workflow.Item.status !== WorkflowStatus.PUBLISHED ||
      workflow.Item.tenantId !== event.tenantId
    ) {
      logger.warn(
        `Skipping scheduled trigger for workflow ${event.workflowId}: workflow is not published`,
      );
      return;
    }

    const timestamp = now().toISOString();
    const traceId = makeUuid();
    const runId = makeUuid();
    const domainEvent: DomainEvent = {
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

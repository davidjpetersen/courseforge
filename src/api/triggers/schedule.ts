import { randomUUID } from 'node:crypto';

import { schedulePK, scheduleSK } from '../../models/schema.js';
import {
  jsonResponse,
  parseJsonBody,
  resolveTenantId,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from './shared.js';

export interface DynamoScheduleClient {
  get(params: {
    TableName: string;
    Key: Record<string, unknown>;
  }): Promise<{ Item?: Record<string, unknown> }>;
  put(params: { TableName: string; Item: Record<string, unknown> }): Promise<unknown>;
  update(params: {
    TableName: string;
    Key: Record<string, unknown>;
    UpdateExpression: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
  }): Promise<unknown>;
}

export interface SchedulerClientLike {
  createSchedule(input: {
    Name: string;
    GroupName: string;
    ScheduleExpression: string;
    FlexibleTimeWindow: { Mode: 'OFF' };
    Target: {
      Arn: string;
      RoleArn: string;
      Input: string;
    };
  }): Promise<unknown>;
  deleteSchedule(input: { Name: string; GroupName: string }): Promise<unknown>;
}

export interface CreateScheduleHandlerDeps {
  dynamoClient: DynamoScheduleClient;
  schedulerClient: SchedulerClientLike;
  schedulesTableName: string;
  scheduleGroupName: string;
  targetArn: string;
  targetRoleArn: string;
}

export interface DeleteScheduleHandlerDeps {
  dynamoClient: DynamoScheduleClient;
  schedulerClient: SchedulerClientLike;
  schedulesTableName: string;
  scheduleGroupName: string;
}

interface ScheduleCreateBody {
  tenantId?: string;
  cronExpression?: string;
}

function isIntegerToken(token: string): boolean {
  return /^\d+$/.test(token);
}

function normalizeCronExpression(cronExpression: string): string | null {
  const trimmed = cronExpression.trim();
  const inner = trimmed.startsWith('cron(') && trimmed.endsWith(')')
    ? trimmed.slice(5, -1).trim()
    : trimmed;
  const parts = inner.split(/\s+/);
  if (parts.length !== 5 && parts.length !== 6) {
    return null;
  }

  const [minutes, hours] = parts;
  if (!minutes || !hours) {
    return null;
  }

  return inner;
}

function validateMinimumInterval(cronExpression: string): boolean {
  const parts = cronExpression.split(/\s+/);
  const [minutes, hours] = parts;

  if (minutes === '*') {
    return false;
  }

  if (minutes.startsWith('*/')) {
    const interval = Number(minutes.slice(2));
    return Number.isFinite(interval) && interval >= 15;
  }

  if (isIntegerToken(minutes) && hours.startsWith('*/')) {
    return true;
  }

  return true;
}

export function buildSchedulePreview(cronExpression: string): string {
  const parts = cronExpression.split(/\s+/);
  const [minutes, hours] = parts;

  if (minutes.startsWith('*/')) {
    return `Runs every ${minutes.slice(2)} minutes`;
  }

  if (isIntegerToken(minutes) && hours.startsWith('*/')) {
    return `Runs every ${hours.slice(2)} hours at minute ${minutes}`;
  }

  if (isIntegerToken(minutes) && isIntegerToken(hours)) {
    return `Runs daily at ${hours.padStart(2, '0')}:${minutes.padStart(2, '0')} UTC`;
  }

  return `Runs on cron schedule ${cronExpression}`;
}

export function createCreateScheduleHandler(deps: CreateScheduleHandlerDeps) {
  return async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    const workflowId = event.pathParameters?.workflowId;
    if (!workflowId) {
      return jsonResponse(400, { message: 'workflowId path parameter is required' });
    }

    const parsedBody = parseJsonBody(event.body);
    if (parsedBody instanceof Error) {
      return jsonResponse(400, { message: parsedBody.message });
    }
    if (typeof parsedBody !== 'object' || parsedBody === null || Array.isArray(parsedBody)) {
      return jsonResponse(400, { message: 'Request body must be a JSON object' });
    }

    const body = parsedBody as ScheduleCreateBody;
    const tenantId = resolveTenantId(event, body as Record<string, unknown>);
    if (!tenantId) {
      return jsonResponse(400, { message: 'tenantId is required' });
    }

    if (!body.cronExpression || typeof body.cronExpression !== 'string') {
      return jsonResponse(400, { message: 'cronExpression is required' });
    }

    const normalizedCron = normalizeCronExpression(body.cronExpression);
    if (!normalizedCron) {
      return jsonResponse(400, { message: 'Invalid cron expression syntax' });
    }

    if (!validateMinimumInterval(normalizedCron)) {
      return jsonResponse(400, {
        message: 'Schedules must be at least 15 minutes apart',
      });
    }

    const scheduleId = randomUUID();
    const now = new Date().toISOString();
    const preview = buildSchedulePreview(normalizedCron);

    await deps.schedulerClient.createSchedule({
      Name: scheduleId,
      GroupName: deps.scheduleGroupName,
      ScheduleExpression: `cron(${normalizedCron})`,
      FlexibleTimeWindow: { Mode: 'OFF' },
      Target: {
        Arn: deps.targetArn,
        RoleArn: deps.targetRoleArn,
        Input: JSON.stringify({ workflowId, tenantId, scheduleId }),
      },
    });

    await deps.dynamoClient.put({
      TableName: deps.schedulesTableName,
      Item: {
        PK: schedulePK(workflowId),
        SK: scheduleSK(scheduleId),
        tenantId,
        workflowId,
        scheduleId,
        cronExpression: normalizedCron,
        preview,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        lastRunAt: null,
      },
    });

    return jsonResponse(200, { scheduleId, preview });
  };
}

export function createDeleteScheduleHandler(deps: DeleteScheduleHandlerDeps) {
  return async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    const workflowId = event.pathParameters?.workflowId;
    const scheduleId = event.pathParameters?.scheduleId;

    if (!workflowId || !scheduleId) {
      return jsonResponse(400, {
        message: 'workflowId and scheduleId path parameters are required',
      });
    }

    const existing = await deps.dynamoClient.get({
      TableName: deps.schedulesTableName,
      Key: {
        PK: schedulePK(workflowId),
        SK: scheduleSK(scheduleId),
      },
    });

    if (!existing.Item || existing.Item.deletedAt) {
      return jsonResponse(404, { message: 'Schedule not found' });
    }

    await deps.schedulerClient.deleteSchedule({
      Name: scheduleId,
      GroupName: deps.scheduleGroupName,
    });

    const deletedAt = new Date().toISOString();
    await deps.dynamoClient.update({
      TableName: deps.schedulesTableName,
      Key: {
        PK: schedulePK(workflowId),
        SK: scheduleSK(scheduleId),
      },
      UpdateExpression: 'SET deletedAt = :deletedAt, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':deletedAt': deletedAt,
        ':updatedAt': deletedAt,
      },
    });

    return jsonResponse(200, { scheduleId, deletedAt });
  };
}

export interface DomainEvent {
  tenantId: string;
  workflowId: string;
  eventType: string;
  payload: unknown;
  traceId: string;
  timestamp: string; // ISO 8601
}

export const TRIGGER_EVENT_TYPES = {
  WEBHOOK_RECEIVED: 'WebhookReceived',
  SCHEDULE_TRIGGERED: 'ScheduleTriggered',
} as const;

export type TriggerEventType =
  (typeof TRIGGER_EVENT_TYPES)[keyof typeof TRIGGER_EVENT_TYPES];

export type TriggerType = 'webhook' | 'scheduled' | 'manual';

export enum WorkflowStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  PAUSED = 'PAUSED',
  ARCHIVED = 'ARCHIVED',
}

export enum RunStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REPLAYING = 'REPLAYING',
}

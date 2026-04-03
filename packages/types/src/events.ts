export interface DomainEvent {
  tenantId: string;
  workflowId: string;
  eventType: string;
  payload: unknown;
  traceId: string;
  timestamp: string; // ISO 8601
}

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

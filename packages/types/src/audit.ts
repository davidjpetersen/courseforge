export type AuditResourceType =
  | 'workflow'
  | 'connection'
  | 'run'
  | 'user'
  | 'environment';

export enum AuditActionType {
  TENANT_CREATED = 'TENANT_CREATED',
  USER_INVITED = 'USER_INVITED',
  USER_ROLE_CHANGED = 'USER_ROLE_CHANGED',
  CONNECTION_CREATED = 'CONNECTION_CREATED',
  CONNECTION_TESTED = 'CONNECTION_TESTED',
  CONNECTION_ROTATED = 'CONNECTION_ROTATED',
  CONNECTION_DELETED = 'CONNECTION_DELETED',
  WORKFLOW_CREATED = 'WORKFLOW_CREATED',
  WORKFLOW_PUBLISHED = 'WORKFLOW_PUBLISHED',
  WORKFLOW_PAUSED = 'WORKFLOW_PAUSED',
  WORKFLOW_ARCHIVED = 'WORKFLOW_ARCHIVED',
  WORKFLOW_PROMOTED = 'WORKFLOW_PROMOTED',
  RUN_COMPLETED = 'RUN_COMPLETED',
  RUN_FAILED = 'RUN_FAILED',
  RUN_REPLAYED = 'RUN_REPLAYED',
  AUDIT_LOG_EXPORTED = 'AUDIT_LOG_EXPORTED',
}

export interface AuditEntry {
  auditId: string;
  tenantId: string;
  actor: string;
  actorEmail: string;
  actionType: AuditActionType;
  resourceType: AuditResourceType;
  resourceId: string;
  detail: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
}

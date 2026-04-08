/**
 * DynamoDB Single-Table Schema for Recipe Library
 *
 * Table: RecipeLibrary
 *
 * Access Patterns:
 *   1. Get template by ID        → PK = TEMPLATE#{templateId}, SK = METADATA
 *   2. List templates by category → GSI1PK = CATEGORY#{categoryName}, GSI1SK = TEMPLATE#{templateId}
 *   3. List workflows by tenant   → PK = TENANT#{tenantId}, SK = WORKFLOW#{workflowId}
 *   4. Get workflow by ID         → PK = TENANT#{tenantId}, SK = WORKFLOW#{workflowId}
 */

// ── Key Prefixes ──

export const KEY_PREFIX = {
  TEMPLATE: 'TEMPLATE#',
  CATEGORY: 'CATEGORY#',
  TENANT: 'TENANT#',
  WORKFLOW: 'WORKFLOW#',
  WORKFLOW_ENTITY: 'WF#',
  CONNECTION: 'CONNECTION#',
  AUDIT: 'AUDIT#',
  ENV: 'ENV#',
  WEBHOOK_SECRET: 'WEBHOOK_SECRET#',
  RUN: 'RUN#',
  SCHEDULE: 'SCHEDULE#',
  STEP: 'STEP#',
  USER: 'USER#',
  NOTIFICATION: 'NOTIFICATION#',
  APIKEY: 'APIKEY#',
  RATELIMIT: 'RATELIMIT#',
} as const;

export const SK_VALUES = {
  METADATA: 'METADATA',
  META: 'META',
} as const;

// ── Key Builders ──

export function templatePK(templateId: string): string {
  return `${KEY_PREFIX.TEMPLATE}${templateId}`;
}

export function templateSK(): string {
  return SK_VALUES.METADATA;
}

export function categoryGSI1PK(categoryName: string): string {
  return `${KEY_PREFIX.CATEGORY}${categoryName}`;
}

export function categoryGSI1SK(templateId: string): string {
  return `${KEY_PREFIX.TEMPLATE}${templateId}`;
}

export function tenantPK(tenantId: string): string {
  return `${KEY_PREFIX.TENANT}${tenantId}`;
}

export function workflowSK(workflowId: string): string {
  return `${KEY_PREFIX.WORKFLOW}${workflowId}`;
}

export function workflowPK(workflowId: string): string {
  return `${KEY_PREFIX.WORKFLOW_ENTITY}${workflowId}`;
}

export function workflowMetaSK(): string {
  return SK_VALUES.META;
}

export function connectionSK(connectionId: string): string {
  return `${KEY_PREFIX.CONNECTION}${connectionId}`;
}

export function envSK(environmentId: string): string {
  return `${KEY_PREFIX.ENV}${environmentId}`;
}

export function auditSK(timestamp: string, id: string): string {
  return `${KEY_PREFIX.AUDIT}${timestamp}#${id}`;
}

export function webhookSecretSK(workflowId: string): string {
  return `${KEY_PREFIX.WEBHOOK_SECRET}${workflowId}`;
}

export function runSK(timestamp: string, runId: string): string {
  return `${KEY_PREFIX.RUN}${timestamp}#${runId}`;
}

export function schedulePK(workflowId: string): string {
  return `${KEY_PREFIX.WORKFLOW}${workflowId}`;
}

export function scheduleSK(scheduleId: string): string {
  return `${KEY_PREFIX.SCHEDULE}${scheduleId}`;
}

export function buildSecretName(tenantId: string, connectionId: string): string {
  return `courseforge/tenant/${tenantId}/connection/${connectionId}`;
}

export function runPK(runId: string): string {
  return `${KEY_PREFIX.RUN}${runId}`;
}

export function stepSK(stepIndex: number, stepId: string): string {
  return `${KEY_PREFIX.STEP}${String(stepIndex).padStart(4, '0')}#${stepId}`;
}

export function userPK(userId: string): string {
  return `${KEY_PREFIX.USER}${userId}`;
}

export function userSK(userId: string): string {
  return `${KEY_PREFIX.USER}${userId}`;
}

// ── Auth Key Prefixes ──

export const KEY_PREFIX_AUTH = {
  EMAIL: 'EMAIL#',
  INVITE: 'INVITE#',
} as const;

export function emailPK(email: string): string {
  return `${KEY_PREFIX_AUTH.EMAIL}${email}`;
}

export function inviteSK(inviteId: string): string {
  return `${KEY_PREFIX_AUTH.INVITE}${inviteId}`;
}

export function notificationSK(timestamp: string, notificationId: string): string {
  return `${KEY_PREFIX.NOTIFICATION}${timestamp}#${notificationId}`;
}

export function apiKeySK(keyId: string): string {
  return `${KEY_PREFIX.APIKEY}${keyId}`;
}

export function rateLimitPK(tenantId: string, endpointGroup: string): string {
  return `${KEY_PREFIX.RATELIMIT}${tenantId}#${endpointGroup}`;
}

export const RATE_LIMIT_SK = 'BUCKET';
export const GSI_HASHED_KEY = 'GSI_HASHED_KEY';

export const GSI_WORKFLOW_RUNS = 'GSI_WORKFLOW_RUNS';
export const GSI_TENANT_STATUS = 'GSI_TENANT_STATUS';

// ── Table & Index Names ──

export const TABLE_NAME = 'RecipeLibrary';
export const CATEGORY_INDEX = 'CategoryIndex';

// ── CloudFormation-style Table Definition ──

export const TABLE_DEFINITION = {
  TableName: TABLE_NAME,
  KeySchema: [
    { AttributeName: 'PK', KeyType: 'HASH' as const },
    { AttributeName: 'SK', KeyType: 'RANGE' as const },
  ],
  AttributeDefinitions: [
    { AttributeName: 'PK', AttributeType: 'S' as const },
    { AttributeName: 'SK', AttributeType: 'S' as const },
    { AttributeName: 'GSI1PK', AttributeType: 'S' as const },
    { AttributeName: 'GSI1SK', AttributeType: 'S' as const },
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: CATEGORY_INDEX,
      KeySchema: [
        { AttributeName: 'GSI1PK', KeyType: 'HASH' as const },
        { AttributeName: 'GSI1SK', KeyType: 'RANGE' as const },
      ],
      Projection: { ProjectionType: 'ALL' as const },
    },
  ],
  BillingMode: 'PAY_PER_REQUEST' as const,
} as const;

// ── Category Index Item Builders ──

/**
 * For templates with multiple categories, we need to write a category index
 * item for each category so the template appears in every category partition.
 *
 * Returns the GSI key attributes for each category the template belongs to.
 */
export function buildCategoryIndexKeys(
  templateId: string,
  categories: string[],
): Array<{ GSI1PK: string; GSI1SK: string }> {
  return categories.map((category) => ({
    GSI1PK: categoryGSI1PK(category),
    GSI1SK: categoryGSI1SK(templateId),
  }));
}

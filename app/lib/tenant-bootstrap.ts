import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { tenantPK, TABLE_NAME } from '../../src/models/schema.js';
import { AuditActionType } from '../../packages/types/src/audit.js';
import { writeAuditLog } from '../../packages/utils/src/audit.js';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function bootstrapTenant(
  tenantId: string,
  adminUserId: string,
): Promise<void> {
  const createdAt = new Date().toISOString();

  await dynamo.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE_NAME,
            Item: {
              PK: tenantPK(tenantId),
              SK: 'META',
              tenantId,
              createdAt,
              createdBy: adminUserId,
            },
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
          },
        },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: {
              PK: tenantPK(tenantId),
              SK: 'ENV#dev',
              environmentId: 'dev',
              tenantId,
              name: 'Development',
              description: 'Development environment',
              createdAt,
              isDefault: true,
            },
          },
        },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: {
              PK: tenantPK(tenantId),
              SK: 'ENV#prod',
              environmentId: 'prod',
              tenantId,
              name: 'Production',
              description: 'Production environment',
              createdAt,
              isDefault: false,
            },
          },
        },
      ],
    }),
  );

  await writeAuditLog({
    tenantId,
    actor: adminUserId,
    actorEmail: 'system@courseforge.local',
    actionType: AuditActionType.TENANT_CREATED,
    resourceType: 'environment',
    resourceId: tenantId,
    detail: { seededEnvironments: ['dev', 'prod'] },
    ipAddress: 'system',
    userAgent: 'tenant-bootstrap',
  });
}

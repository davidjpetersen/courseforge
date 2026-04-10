import type { DynamoClient } from '../../packages/utils/src/audit';
import { writeAuditLog } from '../../packages/utils/src/audit';
import { tenantPK, envSK, SK_VALUES } from '../../src/models/schema';
import { ActionType } from '../../packages/types/src/audit';

export interface BootstrapInput {
  tenantId: string;
  adminUserId: string;
  adminEmail: string;
}

export async function bootstrapTenant(
  client: DynamoClient,
  tableName: string,
  input: BootstrapInput,
): Promise<void> {
  const { tenantId, adminUserId, adminEmail } = input;
  const now = new Date().toISOString();

  // 1. Create Tenant META record
  await client.put({
    TableName: tableName,
    Item: {
      PK: tenantPK(tenantId),
      SK: SK_VALUES.META,
      tenantId,
    },
  });

  // 2. Create dev Environment_Record (default)
  await client.put({
    TableName: tableName,
    Item: {
      PK: tenantPK(tenantId),
      SK: envSK('dev'),
      environmentId: 'dev',
      tenantId,
      name: 'Development',
      description: '',
      isDefault: true,
      createdAt: now,
    },
  });

  // 3. Create prod Environment_Record
  await client.put({
    TableName: tableName,
    Item: {
      PK: tenantPK(tenantId),
      SK: envSK('prod'),
      environmentId: 'prod',
      tenantId,
      name: 'Production',
      description: '',
      isDefault: false,
      createdAt: now,
    },
  });

  // 4. Write TENANT_CREATED audit entry
  await writeAuditLog(client, tableName, {
    tenantId,
    actor: adminUserId,
    actorEmail: adminEmail,
    actionType: ActionType.TENANT_CREATED,
    resourceType: 'environment',
    resourceId: tenantId,
    detail: {},
    ipAddress: '',
    userAgent: '',
  });
}

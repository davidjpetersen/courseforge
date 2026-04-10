import { describe, it, expect, vi } from 'vitest';

import { bootstrapTenant, type BootstrapInput } from './tenant-bootstrap';
import type { DynamoClient } from '../../packages/utils/src/audit';

function buildInput(overrides?: Partial<BootstrapInput>): BootstrapInput {
  return {
    tenantId: 'tenant-abc',
    adminUserId: 'admin-1',
    adminEmail: 'admin@example.com',
    ...overrides,
  };
}

describe('bootstrapTenant', () => {
  it('creates all 4 records (Tenant META, dev env, prod env, audit entry)', async () => {
    const putCalls: Array<{ TableName: string; Item: Record<string, unknown> }> = [];
    const client: DynamoClient = {
      put: vi.fn().mockImplementation(async (params) => {
        putCalls.push(params);
      }),
    };

    await bootstrapTenant(client, 'TestTable', buildInput());

    // 3 direct puts + 1 from writeAuditLog = 4 total
    expect(client.put).toHaveBeenCalledTimes(4);

    // Verify PK/SK patterns of the first 3 direct calls
    expect(putCalls[0]).toMatchObject({
      TableName: 'TestTable',
      Item: expect.objectContaining({
        PK: 'TENANT#tenant-abc',
        SK: 'META',
      }),
    });

    expect(putCalls[1]).toMatchObject({
      TableName: 'TestTable',
      Item: expect.objectContaining({
        PK: 'TENANT#tenant-abc',
        SK: 'ENV#dev',
        isDefault: true,
      }),
    });

    expect(putCalls[2]).toMatchObject({
      TableName: 'TestTable',
      Item: expect.objectContaining({
        PK: 'TENANT#tenant-abc',
        SK: 'ENV#prod',
        isDefault: false,
      }),
    });
  });

  it('propagates DynamoDB errors to the caller', async () => {
    const dbError = new Error('ProvisionedThroughputExceededException');
    const client: DynamoClient = {
      put: vi.fn().mockRejectedValue(dbError),
    };

    await expect(
      bootstrapTenant(client, 'TestTable', buildInput()),
    ).rejects.toThrow(dbError);
  });
});

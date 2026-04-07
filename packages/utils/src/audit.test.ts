import { describe, it, expect, vi } from 'vitest';

import { writeAuditLog, type DynamoClient, type WriteAuditInput } from './audit.js';
import { ActionType } from '../../types/src/audit.js';

function buildInput(overrides?: Partial<WriteAuditInput>): WriteAuditInput {
  return {
    tenantId: 'tenant-1',
    actor: 'user-1',
    actorEmail: 'user@example.com',
    actionType: ActionType.TENANT_CREATED,
    resourceType: 'environment',
    resourceId: 'env-dev',
    detail: {},
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
    ...overrides,
  };
}

describe('writeAuditLog', () => {
  it('resolves without error when client.put succeeds', async () => {
    const client: DynamoClient = { put: vi.fn().mockResolvedValue(undefined) };

    await expect(
      writeAuditLog(client, 'TestTable', buildInput()),
    ).resolves.toBeUndefined();

    expect(client.put).toHaveBeenCalledOnce();
  });

  it('rethrows when client.put throws a DynamoDB error', async () => {
    const dbError = new Error('ConditionalCheckFailedException');
    const client: DynamoClient = { put: vi.fn().mockRejectedValue(dbError) };

    await expect(
      writeAuditLog(client, 'TestTable', buildInput()),
    ).rejects.toThrow(dbError);
  });

  it('produces distinct SKs for two calls with the same timestamp', async () => {
    const items: Record<string, unknown>[] = [];
    const client: DynamoClient = {
      put: vi.fn().mockImplementation(async (params: { TableName: string; Item: Record<string, unknown> }) => {
        items.push(params.Item);
      }),
    };

    // Fix Date.now so both calls share the same ISO timestamp
    const fixed = new Date('2025-01-15T00:00:00.000Z');
    vi.spyOn(globalThis, 'Date').mockImplementation(() => fixed as unknown as Date);

    await writeAuditLog(client, 'TestTable', buildInput());
    await writeAuditLog(client, 'TestTable', buildInput());

    vi.restoreAllMocks();

    expect(items).toHaveLength(2);
    expect(items[0]!.SK).not.toBe(items[1]!.SK);
  });
});

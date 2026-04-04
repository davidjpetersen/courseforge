import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { AuditActionType } from '../../types/src/audit.js';
import { writeAuditLog } from './audit.js';

describe('writeAuditLog', () => {
  const sendMock = vi.spyOn(DynamoDBDocumentClient.prototype, 'send');

  beforeEach(() => {
    sendMock.mockReset();
  });

  const baseEntry = {
    tenantId: 'tenant-1',
    actor: 'user-1',
    actorEmail: 'user@example.com',
    actionType: AuditActionType.WORKFLOW_CREATED,
    resourceType: 'workflow' as const,
    resourceId: 'wf-1',
    detail: { source: 'test' },
    ipAddress: '127.0.0.1',
    userAgent: 'vitest',
  };

  it('writes successfully without throwing', async () => {
    sendMock.mockResolvedValueOnce({});

    await expect(writeAuditLog(baseEntry)).resolves.toBeUndefined();
    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0]?.[0]).toBeInstanceOf(PutCommand);
  });

  it('rethrows on DynamoDB error', async () => {
    sendMock.mockRejectedValueOnce(new Error('dynamo is unavailable'));

    await expect(writeAuditLog(baseEntry)).rejects.toThrow('dynamo is unavailable');
  });

  it('creates unique SK values when timestamps match', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    sendMock.mockResolvedValue({});

    await writeAuditLog(baseEntry);
    await writeAuditLog(baseEntry);

    const first = sendMock.mock.calls[0]?.[0] as PutCommand;
    const second = sendMock.mock.calls[1]?.[0] as PutCommand;

    const firstInput = first.input;
    const secondInput = second.input;

    expect(firstInput.Item?.SK).not.toBe(secondInput.Item?.SK);

    vi.useRealTimers();
  });
});

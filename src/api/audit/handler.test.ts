import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createQueryAuditHandler,
  createExportAuditHandler,
  AuditRepository,
} from './handler.js';
import type { APIGatewayProxyEvent } from './handler.js';
import type { WriteAuditInput } from '../../../packages/utils/src/audit.js';
import { ActionType } from '../../../packages/types/src/audit.js';
import type { AuditEntry } from '../../../packages/types/src/audit.js';

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/api/audit',
    headers: {
      'x-tenant-id': 'tenant-1',
      'x-user-role': 'Admin',
      'x-user-id': 'user-1',
      'x-user-email': 'admin@example.com',
    },
    queryStringParameters: null,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    auditId: 'audit-1',
    tenantId: 'tenant-1',
    actor: 'user-1',
    actorEmail: 'admin@example.com',
    actionType: ActionType.WORKFLOW_CREATED,
    resourceType: 'workflow',
    resourceId: 'wf-1',
    detail: {},
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
    timestamp: '2024-01-15T10:00:00.000Z',
    ...overrides,
  };
}

function makeMockRepo(): AuditRepository {
  return {
    query: vi.fn().mockResolvedValue({ entries: [], nextCursor: undefined }),
    queryAll: vi.fn().mockResolvedValue([]),
  };
}

function makeMockAuditWriter(): { write: ReturnType<typeof vi.fn> } {
  return { write: vi.fn().mockResolvedValue(undefined) };
}

describe('createQueryAuditHandler', () => {
  let repo: AuditRepository;

  beforeEach(() => {
    repo = makeMockRepo();
  });

  it('returns 403 when x-user-role is not Admin', async () => {
    const handler = createQueryAuditHandler(repo);
    const response = await handler(makeEvent({ headers: { 'x-tenant-id': 'tenant-1', 'x-user-role': 'Viewer' } }));

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.message).toMatch(/admin/i);
  });

  it('returns 200 with entries and nextCursor for Admin user', async () => {
    const entries = [makeEntry(), makeEntry({ auditId: 'audit-2' })];
    (repo.query as ReturnType<typeof vi.fn>).mockResolvedValue({ entries, nextCursor: 'cursor-abc' });

    const handler = createQueryAuditHandler(repo);
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.entries).toHaveLength(2);
    expect(body.nextCursor).toBe('cursor-abc');
  });
});

describe('createExportAuditHandler', () => {
  let repo: AuditRepository;
  let auditWriter: { write: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    repo = makeMockRepo();
    auditWriter = makeMockAuditWriter();
  });

  it('returns 403 when x-user-role is not Admin', async () => {
    const handler = createExportAuditHandler(repo, auditWriter);
    const response = await handler(makeEvent({ headers: { 'x-tenant-id': 'tenant-1', 'x-user-role': 'Viewer' } }));

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.message).toMatch(/admin/i);
  });

  it('returns response with Content-Type text/csv and Content-Disposition headers', async () => {
    const entries = [makeEntry()];
    (repo.queryAll as ReturnType<typeof vi.fn>).mockResolvedValue(entries);

    const handler = createExportAuditHandler(repo, auditWriter);
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(200);
    expect(response.headers?.['Content-Type']).toBe('text/csv');
    expect(response.headers?.['Content-Disposition']).toBe('attachment; filename="audit-log.csv"');
  });

  it('writes AUDIT_LOG_EXPORTED audit entry with recordCount in detail', async () => {
    const entries = [makeEntry(), makeEntry({ auditId: 'audit-2' }), makeEntry({ auditId: 'audit-3' })];
    (repo.queryAll as ReturnType<typeof vi.fn>).mockResolvedValue(entries);

    const handler = createExportAuditHandler(repo, auditWriter);
    await handler(makeEvent());

    expect(auditWriter.write).toHaveBeenCalledOnce();
    const writtenEntry: WriteAuditInput = auditWriter.write.mock.calls[0][0];
    expect(writtenEntry.actionType).toBe(ActionType.AUDIT_LOG_EXPORTED);
    expect(writtenEntry.tenantId).toBe('tenant-1');
    expect(writtenEntry.detail).toEqual(
      expect.objectContaining({ recordCount: 3 }),
    );
  });
});

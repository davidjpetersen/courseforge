import { NextRequest, NextResponse } from 'next/server';
import { AuditActionType } from '../../../../packages/types/src/audit.js';
import { writeAuditLog } from '../../../../packages/utils/src/audit.js';

function isAdmin(request: NextRequest): boolean {
  return request.headers.get('x-user-role') === 'Admin';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAdmin(request)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const tenantId = request.headers.get('x-tenant-id');
  if (!tenantId) {
    return NextResponse.json({ message: 'Missing tenant context' }, { status: 401 });
  }

  const auditUrl = new URL('/api/audit', request.url);
  request.nextUrl.searchParams.forEach((value, key) => {
    if (key !== 'cursor' && key !== 'limit') {
      auditUrl.searchParams.set(key, value);
    }
  });
  auditUrl.searchParams.set('limit', '1000');

  const response = await fetch(auditUrl, {
    headers: request.headers,
  });
  const payload = (await response.json()) as { entries: Array<Record<string, unknown>> };

  const headers = [
    'timestamp',
    'actor',
    'actorEmail',
    'actionType',
    'resourceType',
    'resourceId',
    'detail',
  ];

  const rows = payload.entries.map((entry) =>
    [
      entry.timestamp,
      entry.actor,
      entry.actorEmail,
      entry.actionType,
      entry.resourceType,
      entry.resourceId,
      JSON.stringify(entry.detail ?? {}),
    ]
      .map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`)
      .join(','),
  );

  const csv = `${headers.join(',')}\n${rows.join('\n')}`;

  await writeAuditLog({
    tenantId,
    actor: request.headers.get('x-user-id') ?? 'unknown',
    actorEmail: request.headers.get('x-user-email') ?? 'unknown',
    actionType: AuditActionType.AUDIT_LOG_EXPORTED,
    resourceType: 'user',
    resourceId: request.headers.get('x-user-id') ?? 'unknown',
    detail: {
      recordCount: payload.entries.length,
      filterParams: Object.fromEntries(request.nextUrl.searchParams.entries()),
    },
    ipAddress: request.headers.get('x-forwarded-for') ?? 'unknown',
    userAgent: request.headers.get('user-agent') ?? 'unknown',
  });

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="audit-log.csv"',
    },
  });
}

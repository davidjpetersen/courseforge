import { NextRequest, NextResponse } from 'next/server';
import { bootstrapTenant } from '../../../../lib/tenant-bootstrap.js';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as { tenantId: string; userId: string };

  if (!body.tenantId || !body.userId) {
    return NextResponse.json({ message: 'tenantId and userId are required' }, { status: 400 });
  }

  await bootstrapTenant(body.tenantId, body.userId);

  return NextResponse.json({ success: true });
}

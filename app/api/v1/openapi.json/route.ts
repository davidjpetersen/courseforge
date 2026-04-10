import { NextResponse } from 'next/server';

import { generateOpenApiSpec } from '../../../../src/api/v1/openapi';

export async function GET() {
  const spec = generateOpenApiSpec();
  return NextResponse.json(spec, {
    headers: { 'Content-Type': 'application/json' },
  });
}

import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

import { createV1RecipeHandler, type RecipeRepository } from '../../../../src/api/v1/recipes.js';
import type { Template } from '../../../../src/models/types.js';
import { runV1Middleware, client, tableName } from '../_middleware.js';

const recipeRepo: RecipeRepository = {
  async listAll(): Promise<Template[]> {
    const result = await client.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: 'begins_with(PK, :prefix) AND SK = :sk',
      ExpressionAttributeValues: { ':prefix': 'TEMPLATE#', ':sk': 'METADATA' },
    }));
    return (result.Items ?? []) as unknown as Template[];
  },
};

const handler = createV1RecipeHandler(recipeRepo);

export async function GET(request: NextRequest) {
  const mw = await runV1Middleware(request, 'GET', '/api/v1/recipes');
  if (mw.error) return mw.error;

  const result = await handler.list({
    httpMethod: 'GET',
    path: '/api/v1/recipes',
    headers: { 'x-tenant-id': mw.auth.tenantId },
    queryStringParameters: Object.fromEntries(request.nextUrl.searchParams.entries()),
  });

  return new NextResponse(result.body, { status: result.statusCode, headers: result.headers });
}

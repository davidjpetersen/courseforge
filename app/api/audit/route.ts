import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

import {
  createQueryAuditHandler,
  type AuditRepository,
  type AuditFilters,
} from '../../../src/api/audit/handler';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.MAIN_TABLE_NAME ?? 'CourseForgeRuns';

function normalizeTenantId(rawTenantId: string): string {
  return rawTenantId.startsWith('TENANT#') ? rawTenantId.slice('TENANT#'.length) : rawTenantId;
}

const auditRepo: AuditRepository = {
  async query(tenantId: string, filters: AuditFilters) {
    const limit = filters.limit ?? 100;

    let keyCondition = 'PK = :pk AND begins_with(SK, :prefix)';
    const exprValues: Record<string, unknown> = {
      ':pk': `TENANT#${tenantId}`,
      ':prefix': 'AUDIT#',
    };

    if (filters.dateFrom && filters.dateTo) {
      keyCondition = 'PK = :pk AND SK BETWEEN :skFrom AND :skTo';
      exprValues[':skFrom'] = `AUDIT#${filters.dateFrom}`;
      exprValues[':skTo'] = `AUDIT#${filters.dateTo}\uffff`;
      delete exprValues[':prefix'];
    }

    const filterParts: string[] = [];
    const exprNames: Record<string, string> = {};

    if (filters.actor) {
      filterParts.push('actor = :actor');
      exprValues[':actor'] = filters.actor;
    }
    if (filters.actionType) {
      filterParts.push('actionType = :actionType');
      exprValues[':actionType'] = filters.actionType;
    }
    if (filters.resourceType) {
      filterParts.push('resourceType = :resourceType');
      exprValues[':resourceType'] = filters.resourceType;
    }
    if (filters.resourceId) {
      filterParts.push('resourceId = :resourceId');
      exprValues[':resourceId'] = filters.resourceId;
    }

    let exclusiveStartKey: Record<string, unknown> | undefined;
    if (filters.cursor) {
      try {
        exclusiveStartKey = JSON.parse(Buffer.from(filters.cursor, 'base64').toString('utf-8'));
      } catch {
        return { entries: [], nextCursor: undefined };
      }
    }

    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: keyCondition,
        ...(filterParts.length > 0 ? { FilterExpression: filterParts.join(' AND ') } : {}),
        ...(Object.keys(exprNames).length > 0 ? { ExpressionAttributeNames: exprNames } : {}),
        ExpressionAttributeValues: exprValues,
        Limit: limit,
        ScanIndexForward: false,
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      }),
    );

    const entries = (result.Items ?? []).map((item) => ({
      auditId: String(item.auditId ?? ''),
      tenantId: String(item.tenantId ?? ''),
      actor: String(item.actor ?? ''),
      actorEmail: String(item.actorEmail ?? ''),
      actionType: item.actionType as string,
      resourceType: item.resourceType as string,
      resourceId: String(item.resourceId ?? ''),
      detail: (item.detail as Record<string, unknown>) ?? {},
      ipAddress: String(item.ipAddress ?? ''),
      userAgent: String(item.userAgent ?? ''),
      timestamp: String(item.timestamp ?? ''),
    })) as import('../../../packages/types/src/audit.js').AuditEntry[];

    let nextCursor: string | undefined;
    if (result.LastEvaluatedKey) {
      nextCursor = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
    }

    return { entries, nextCursor };
  },

  async queryAll() {
    return [];
  },
};

const handler = createQueryAuditHandler(auditRepo);

export async function GET(request: NextRequest) {
  const tenantId = normalizeTenantId(request.headers.get('x-tenant-id') ?? 'CURRENT');
  const result = await handler({
    httpMethod: 'GET',
    path: '/api/audit',
    headers: {
      'x-tenant-id': tenantId,
      'x-user-role': request.headers.get('x-user-role') ?? '',
    },
    queryStringParameters: Object.fromEntries(request.nextUrl.searchParams.entries()),
  });

  return new NextResponse(result.body, {
    status: result.statusCode,
    headers: result.headers,
  });
}

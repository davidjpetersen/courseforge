import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

import {
  createExportAuditHandler,
  type AuditRepository,
  type AuditFilters,
} from '../../../../src/api/audit/handler';
import { writeAuditLog } from '../../../../packages/utils/src/audit';
import type { AuditEntry } from '../../../../packages/types/src/audit';

const dynamo = new DynamoDBClient({});
const client = DynamoDBDocumentClient.from(dynamo);
const tableName = process.env.MAIN_TABLE_NAME ?? 'CourseForgeRuns';

function normalizeTenantId(rawTenantId: string): string {
  return rawTenantId.startsWith('TENANT#') ? rawTenantId.slice('TENANT#'.length) : rawTenantId;
}

const auditRepo: AuditRepository = {
  async query() {
    return { entries: [], nextCursor: undefined };
  },

  async queryAll(tenantId: string, filters: AuditFilters) {
    const allEntries: AuditEntry[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

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

    do {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: keyCondition,
          ...(filterParts.length > 0 ? { FilterExpression: filterParts.join(' AND ') } : {}),
          ExpressionAttributeValues: exprValues,
          ScanIndexForward: false,
          ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
        }),
      );

      for (const item of result.Items ?? []) {
        allEntries.push({
          auditId: String(item.auditId ?? ''),
          tenantId: String(item.tenantId ?? ''),
          actor: String(item.actor ?? ''),
          actorEmail: String(item.actorEmail ?? ''),
          actionType: item.actionType as AuditEntry['actionType'],
          resourceType: item.resourceType as AuditEntry['resourceType'],
          resourceId: String(item.resourceId ?? ''),
          detail: (item.detail as Record<string, unknown>) ?? {},
          ipAddress: String(item.ipAddress ?? ''),
          userAgent: String(item.userAgent ?? ''),
          timestamp: String(item.timestamp ?? ''),
        });
      }

      exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return allEntries;
  },
};

const auditWriter = {
  write: (entry: import('../../../../packages/utils/src/audit.js').WriteAuditInput) =>
    writeAuditLog(client as unknown as import('../../../../packages/utils/src/audit.js').DynamoClient, tableName, entry),
};

const handler = createExportAuditHandler(auditRepo, auditWriter);

export async function GET(request: NextRequest) {
  const tenantId = normalizeTenantId(request.headers.get('x-tenant-id') ?? 'CURRENT');
  const result = await handler({
    httpMethod: 'GET',
    path: '/api/audit/export',
    headers: {
      'x-tenant-id': tenantId,
      'x-user-role': request.headers.get('x-user-role') ?? '',
      'x-user-id': request.headers.get('x-user-id') ?? '',
      'x-user-email': request.headers.get('x-user-email') ?? '',
      'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '',
      'user-agent': request.headers.get('user-agent') ?? '',
    },
    queryStringParameters: Object.fromEntries(request.nextUrl.searchParams.entries()),
  });

  return new NextResponse(result.body, {
    status: result.statusCode,
    headers: result.headers,
  });
}

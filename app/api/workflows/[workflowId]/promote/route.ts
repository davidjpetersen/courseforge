import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';
import { tenantPK, workflowSK, TABLE_NAME } from '../../../../../src/models/schema.js';
import { AuditActionType } from '../../../../../packages/types/src/audit.js';
import { writeAuditLog } from '../../../../../packages/utils/src/audit.js';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workflowId: string }> },
): Promise<NextResponse> {
  const { workflowId } = await context.params;
  const tenantId = request.headers.get('x-tenant-id');
  const promotingUserId = request.headers.get('x-user-id') ?? 'unknown';

  if (!tenantId) {
    return NextResponse.json({ message: 'Missing tenant context' }, { status: 401 });
  }

  const source = await dynamo.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: tenantPK(tenantId), SK: workflowSK(workflowId) },
    }),
  );

  const sourceWorkflow = source.Item;
  if (!sourceWorkflow || sourceWorkflow.environmentId !== 'dev') {
    return NextResponse.json({ message: 'Only dev workflows can be promoted' }, { status: 400 });
  }

  if (sourceWorkflow.status !== 'PUBLISHED') {
    return NextResponse.json({ message: 'Only published workflows can be promoted' }, { status: 400 });
  }

  const newWorkflowId = randomUUID();
  const now = new Date().toISOString();

  await dynamo.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...sourceWorkflow,
        workflowId: newWorkflowId,
        SK: workflowSK(newWorkflowId),
        environmentId: 'prod',
        status: 'DRAFT',
        createdBy: promotingUserId,
        createdAt: now,
        updatedAt: now,
      },
    }),
  );

  const sourceVersions = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :versionPrefix)',
      ExpressionAttributeValues: {
        ':pk': `WF#${workflowId}`,
        ':versionPrefix': 'VERSION#',
      },
      ScanIndexForward: false,
      Limit: 1,
    }),
  );

  const latestVersion = sourceVersions.Items?.[0];
  if (latestVersion) {
    await dynamo.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...latestVersion,
          PK: `WF#${newWorkflowId}`,
          workflowId: newWorkflowId,
        },
      }),
    );
  }

  await writeAuditLog({
    tenantId,
    actor: promotingUserId,
    actorEmail: request.headers.get('x-user-email') ?? 'unknown',
    actionType: AuditActionType.WORKFLOW_PROMOTED,
    resourceType: 'workflow',
    resourceId: newWorkflowId,
    detail: { sourceWorkflowId: workflowId, targetWorkflowId: newWorkflowId },
    ipAddress: request.headers.get('x-forwarded-for') ?? 'unknown',
    userAgent: request.headers.get('user-agent') ?? 'unknown',
  });

  return NextResponse.json({ newWorkflowId, environmentId: 'prod', status: 'DRAFT' });
}

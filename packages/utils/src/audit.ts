import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { auditSK, tenantPK, TABLE_NAME } from '../../../src/models/schema.js';
import type { AuditEntry } from '../../types/src/audit.js';

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function writeAuditLog(
  entry: Omit<AuditEntry, 'auditId' | 'timestamp'>,
): Promise<void> {
  const auditId = randomUUID();
  const timestamp = new Date().toISOString();

  const item: AuditEntry & { PK: string; SK: string } = {
    ...entry,
    auditId,
    timestamp,
    PK: tenantPK(entry.tenantId),
    SK: auditSK(timestamp, auditId),
  };

  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      }),
    );
  } catch (error) {
    console.error('Failed to write audit log entry', {
      tenantId: entry.tenantId,
      actionType: entry.actionType,
      error,
    });
    throw error;
  }
}

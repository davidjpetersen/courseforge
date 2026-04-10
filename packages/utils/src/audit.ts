import type { AuditEntry } from '../../types/src/audit';
import { tenantPK, auditSK } from '../../../src/models/schema';

export interface DynamoClient {
  put(params: { TableName: string; Item: Record<string, unknown> }): Promise<void>;
}

export type WriteAuditInput = Omit<AuditEntry, 'auditId' | 'timestamp'>;

export async function writeAuditLog(
  client: DynamoClient,
  tableName: string,
  entry: WriteAuditInput,
): Promise<void> {
  const auditId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const PK = tenantPK(entry.tenantId);
  const SK = auditSK(timestamp, auditId);

  try {
    await client.put({
      TableName: tableName,
      Item: {
        PK,
        SK,
        auditId,
        timestamp,
        ...entry,
      },
    });
  } catch (error) {
    console.error('Failed to write audit log entry', error);
    throw error;
  }
}

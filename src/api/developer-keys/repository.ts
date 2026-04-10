import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import type { ApiKeyRecord } from '../../../packages/types/src/api-keys';
import { tenantPK, apiKeySK, GSI_HASHED_KEY } from '../../models/schema';

export interface ApiKeyRepository {
  create(record: ApiKeyRecord): Promise<void>;
  listByTenant(tenantId: string): Promise<ApiKeyRecord[]>;
  getByKeyId(tenantId: string, keyId: string): Promise<ApiKeyRecord | null>;
  revoke(tenantId: string, keyId: string, deletedAt: string): Promise<void>;
  findByHash(hashedKey: string): Promise<ApiKeyRecord | null>;
  updateLastUsed(tenantId: string, keyId: string, timestamp: string): Promise<void>;
}

function toApiKeyRecord(item: Record<string, unknown>): ApiKeyRecord {
  return {
    keyId: String(item.keyId),
    tenantId: String(item.tenantId),
    name: String(item.name),
    hashedKey: String(item.hashedKey),
    scope: String(item.scope) as ApiKeyRecord['scope'],
    createdBy: String(item.createdBy),
    createdAt: String(item.createdAt),
    lastUsedAt: item.lastUsedAt ? String(item.lastUsedAt) : null,
    enabled: Boolean(item.enabled),
    deletedAt: item.deletedAt ? String(item.deletedAt) : null,
  };
}

export function createDynamoApiKeyRepository(
  client: Pick<DynamoDBDocumentClient, 'send'>,
  tableName: string,
): ApiKeyRepository {
  return {
    async create(record) {
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            PK: tenantPK(record.tenantId),
            SK: apiKeySK(record.keyId),
            ...record,
          },
        }),
      );
    },

    async listByTenant(tenantId) {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
          ExpressionAttributeValues: {
            ':pk': tenantPK(tenantId),
            ':skPrefix': 'APIKEY#',
          },
        }),
      );

      return (result.Items ?? []).map((item) =>
        toApiKeyRecord(item as Record<string, unknown>),
      );
    },

    async getByKeyId(tenantId, keyId) {
      const result = await client.send(
        new GetCommand({
          TableName: tableName,
          Key: {
            PK: tenantPK(tenantId),
            SK: apiKeySK(keyId),
          },
        }),
      );

      return result.Item
        ? toApiKeyRecord(result.Item as Record<string, unknown>)
        : null;
    },

    async revoke(tenantId, keyId, deletedAt) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: {
            PK: tenantPK(tenantId),
            SK: apiKeySK(keyId),
          },
          UpdateExpression: 'SET enabled = :enabled, deletedAt = :deletedAt',
          ExpressionAttributeValues: {
            ':enabled': false,
            ':deletedAt': deletedAt,
          },
        }),
      );
    },

    async findByHash(hashedKey) {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: GSI_HASHED_KEY,
          KeyConditionExpression: 'hashedKey = :hk',
          ExpressionAttributeValues: {
            ':hk': hashedKey,
          },
        }),
      );

      const item = result.Items?.[0];
      return item ? toApiKeyRecord(item as Record<string, unknown>) : null;
    },

    async updateLastUsed(tenantId, keyId, timestamp) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: {
            PK: tenantPK(tenantId),
            SK: apiKeySK(keyId),
          },
          UpdateExpression: 'SET lastUsedAt = :ts',
          ExpressionAttributeValues: {
            ':ts': timestamp,
          },
        }),
      );
    },
  };
}

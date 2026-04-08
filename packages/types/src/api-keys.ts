export type ApiKeyScope = 'read' | 'write';

export type EndpointGroup = 'read' | 'write' | 'events';

export interface ApiKeyRecord {
  keyId: string;
  tenantId: string;
  name: string;
  hashedKey: string;
  scope: ApiKeyScope;
  createdBy: string;
  createdAt: string; // ISO 8601
  lastUsedAt: string | null;
  enabled: boolean;
  deletedAt: string | null;
}

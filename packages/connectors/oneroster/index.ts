export interface JSONSchema7 {
  type?: string;
  properties?: Record<string, JSONSchema7>;
  required?: string[];
  enum?: string[];
  items?: JSONSchema7;
  additionalProperties?: boolean;
}

export interface ConnectorDefinition<TParams = unknown, TResult = unknown> {
  key: string;
  displayName: string;
  authType: 'oauth2' | 'apikey' | 'basic';
  credentialSchema: JSONSchema7;
  testFn: (credentials: Record<string, unknown>) => Promise<boolean>;
  run: (params: TParams, context: ConnectorContext) => Promise<TResult>;
}

export interface ConnectorContext {
  tenantId: string;
  runId: string;
  metrics?: {
    putMetric: (name: string, value: number, namespace: string) => void;
  };
  s3Client?: {
    putObject(input: {
      bucket: string;
      key: string;
      body: string;
      contentType: string;
    }): Promise<unknown>;
  };
}

export interface FieldMapping {
  sourceField: string;
  targetField: string;
}

export interface OneRosterParams {
  baseUrl: string;
  syncScope: 'delta' | 'full';
  targetOrgId?: string;
  lastSyncedAt?: string;
  fieldMappings: FieldMapping[];
  clientId?: string;
  clientSecret?: string;
}

export interface OneRosterSyncError {
  recordId: string;
  recordType: 'user' | 'class' | 'enrollment';
  errorCode: string;
  message: string;
}

export interface OneRosterResult {
  synced: number;
  added: number;
  updated: number;
  removed: number;
  errors: OneRosterSyncError[];
  lastSyncedAt: string;
}

export class BatchSyncThresholdError extends Error {
  constructor(public readonly errorRate: number, public readonly total: number) {
    super(`OneRoster sync exceeded error threshold: ${(errorRate * 100).toFixed(2)}% (${total} total)`);
    this.name = 'BatchSyncThresholdError';
  }
}

const tokenCache = new Map<string, string>();

function buildUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

export function buildEnrollmentsUrl(baseUrl: string, since?: string): string {
  const url = new URL(buildUrl(baseUrl, '/ims/oneroster/v1p1/enrollments'));
  if (since) {
    url.searchParams.set('filter', `dateLastModified>'${since}'`);
  }
  return url.toString();
}

function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const sections = linkHeader.split(',').map((v) => v.trim());
  for (const section of sections) {
    const match = section.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
    if (match?.[2] === 'next') {
      return match[1];
    }
  }
  return null;
}

export async function getAccessToken(
  baseUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const cacheKey = `${baseUrl}::${clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached) return cached;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(buildUrl(baseUrl, '/ims/oneroster/v1p1/token'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw new Error(`Failed to get OneRoster token: ${response.status}`);
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error('OneRoster token response missing access_token');
  }

  tokenCache.set(cacheKey, payload.access_token);
  return payload.access_token;
}

export async function fetchEnrollments(
  baseUrl: string,
  accessToken: string,
  since?: string,
): Promise<Record<string, unknown>[]> {
  const enrollments: Record<string, unknown>[] = [];
  let nextUrl: string | null = buildEnrollmentsUrl(baseUrl, since);

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch enrollments: ${response.status}`);
    }

    const payload = (await response.json()) as { enrollments?: Record<string, unknown>[] };
    enrollments.push(...(payload.enrollments ?? []));
    nextUrl = parseNextLink(response.headers.get('link'));
  }

  return enrollments;
}

export async function fetchUsers(
  baseUrl: string,
  accessToken: string,
  userIds: string[],
): Promise<Record<string, unknown>[]> {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  const batches: string[][] = [];
  for (let i = 0; i < uniqueIds.length; i += 50) {
    batches.push(uniqueIds.slice(i, i + 50));
  }

  const users: Record<string, unknown>[] = [];

  for (const batch of batches) {
    const url = new URL(buildUrl(baseUrl, '/ims/oneroster/v1p1/users'));
    const quotedIds = batch.map((id) => `'${id}'`).join(',');
    url.searchParams.set('filter', `sourcedId in (${quotedIds})`);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch users: ${response.status}`);
    }

    const payload = (await response.json()) as { users?: Record<string, unknown>[] };
    users.push(...(payload.users ?? []));
  }

  return users;
}

export function applyFieldMappings(
  record: Record<string, unknown>,
  mappings: FieldMapping[],
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};

  for (const mapping of mappings) {
    if (Object.prototype.hasOwnProperty.call(record, mapping.sourceField)) {
      mapped[mapping.targetField] = record[mapping.sourceField];
    }
  }

  return mapped;
}

export async function syncToTarget(
  mappedRecords: Record<string, unknown>[],
  context: ConnectorContext,
): Promise<number> {
  const s3Client = context.s3Client;
  const bucket = 'courseforge-artifacts';
  const key = `${context.tenantId}/oneroster-sync/${context.runId}/output.json`;

  if (!s3Client) {
    throw new Error('Missing s3Client for OneRoster sync output write');
  }
  await s3Client.putObject({
    bucket,
    key,
    body: JSON.stringify(mappedRecords),
    contentType: 'application/json',
  });

  return mappedRecords.length;
}

function emitMetric(context: ConnectorContext, name: string, value: number): void {
  if (context.metrics) {
    context.metrics.putMetric(name, value, 'courseforge');
    return;
  }

  console.log(
    JSON.stringify({
      _aws: {
        CloudWatchMetrics: [
          {
            Namespace: 'courseforge',
            Dimensions: [['Connector']],
            Metrics: [{ Name: name, Unit: 'Count' }],
          },
        ],
        Timestamp: Date.now(),
      },
      Connector: 'oneroster',
      [name]: value,
    }),
  );
}

export const oneRosterConnector: ConnectorDefinition<OneRosterParams, OneRosterResult> = {
  key: 'oneroster',
  displayName: 'OneRoster Roster Sync',
  authType: 'oauth2',
  credentialSchema: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string' },
      clientId: { type: 'string' },
      clientSecret: { type: 'string' },
    },
    required: ['baseUrl', 'clientId', 'clientSecret'],
    additionalProperties: false,
  },
  async testFn(credentials: Record<string, unknown>): Promise<boolean> {
    const baseUrl = String(credentials.baseUrl ?? '');
    const clientId = String(credentials.clientId ?? '');
    const clientSecret = String(credentials.clientSecret ?? '');

    try {
      const token = await getAccessToken(baseUrl, clientId, clientSecret);
      const response = await fetch(buildUrl(baseUrl, '/ims/oneroster/v1p1/schools'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.status === 200;
    } catch {
      return false;
    }
  },
  async run(params: OneRosterParams, context: ConnectorContext): Promise<OneRosterResult> {
    const errors: OneRosterSyncError[] = [];
    const token = await getAccessToken(
      params.baseUrl,
      String(params.clientId ?? ''),
      String(params.clientSecret ?? ''),
    );
    const since = params.syncScope === 'delta' ? params.lastSyncedAt : undefined;
    const enrollments = await fetchEnrollments(params.baseUrl, token, since);

    const filteredEnrollments = params.targetOrgId
      ? enrollments.filter((item) => item.schoolSourcedId === params.targetOrgId)
      : enrollments;

    const userIds = filteredEnrollments
      .map((entry) => entry.userSourcedId)
      .filter((value): value is string => typeof value === 'string');

    let users: Record<string, unknown>[] = [];
    try {
      users = await fetchUsers(params.baseUrl, token, userIds);
    } catch (error) {
      for (const enrollment of filteredEnrollments) {
        errors.push({
          recordId: String(enrollment.sourcedId ?? 'unknown'),
          recordType: 'enrollment',
          errorCode: 'USER_FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to fetch users',
        });
      }
    }
    const usersById = new Map(
      users
        .map((user) => [user.sourcedId, user] as const)
        .filter((entry): entry is [string, Record<string, unknown>] => typeof entry[0] === 'string'),
    );

    const mapped: Record<string, unknown>[] = [];

    for (const enrollment of filteredEnrollments) {
      try {
        const userId = enrollment.userSourcedId;
        const user = typeof userId === 'string' ? usersById.get(userId) : undefined;
        const mergedRecord: Record<string, unknown> = {
          ...enrollment,
          ...(user ?? {}),
        };

        mapped.push(applyFieldMappings(mergedRecord, params.fieldMappings));
      } catch (error) {
        errors.push({
          recordId: String(enrollment.sourcedId ?? 'unknown'),
          recordType: 'enrollment',
          errorCode: 'MAP_FAILED',
          message: error instanceof Error ? error.message : 'Unknown mapping error',
        });
      }
    }

    const synced = await syncToTarget(mapped, context);
    emitMetric(context, 'OneRosterSyncErrors', errors.length);
    emitMetric(context, 'OneRosterSynced', synced);

    const total = filteredEnrollments.length;
    const errorRate = total === 0 ? 0 : errors.length / total;
    if (errorRate > 0.2) {
      throw new BatchSyncThresholdError(errorRate, total);
    }

    return {
      synced,
      added: synced,
      updated: 0,
      removed: 0,
      errors,
      lastSyncedAt: new Date().toISOString(),
    };
  },
};

export default oneRosterConnector;

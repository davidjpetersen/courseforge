import type { Workflow } from '../../models/types';
import {
  buildAuditEntry,
  buildNewConnectionRecord,
  buildSecretName,
  filterDependentWorkflows,
  hasPublishedDependents,
  mapConnectionToListItem,
  mapTestResultToStatus,
  validateCredentials,
} from './logic';
import type {
  AuditLogEntry,
  ConnectionRecord,
  ConnectorDefinition,
} from '../../models/types';

export interface APIGatewayProxyEvent {
  httpMethod: string;
  path: string;
  pathParameters?: Record<string, string> | null;
  queryStringParameters?: Record<string, string> | null;
  headers?: Record<string, string> | null;
  body?: string | null;
}

export interface APIGatewayProxyResult {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

export interface ConnectionRepository {
  create(connection: ConnectionRecord): Promise<void>;
  getById(tenantId: string, connectionId: string): Promise<ConnectionRecord | null>;
  listByTenant(tenantId: string): Promise<ConnectionRecord[]>;
  update(
    tenantId: string,
    connectionId: string,
    fields: Partial<ConnectionRecord>,
  ): Promise<void>;
  softDelete(tenantId: string, connectionId: string, deletedAt: string): Promise<void>;
}

export interface WorkflowRepository {
  listByTenant(tenantId: string): Promise<Workflow[]>;
}

export interface SecretsService {
  createSecret(secretName: string, value: Record<string, unknown>): Promise<string>;
  getSecretValue(secretRef: string): Promise<Record<string, unknown>>;
  putSecretValue(secretRef: string, value: Record<string, unknown>): Promise<void>;
  scheduleDelete(secretRef: string, recoveryWindowDays: number): Promise<void>;
}

export interface AuditRepository {
  writeEntry(entry: AuditLogEntry): Promise<void>;
}

export interface CreateConnectionRequest {
  tenantId: string;
  connectorKey: string;
  displayName: string;
  authType: ConnectionRecord['authType'];
  credentials: Record<string, unknown>;
  createdBy?: string;
  scopes?: string[];
}

export interface RotateConnectionRequest {
  tenantId: string;
  credentials: Record<string, unknown>;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

function parseJsonBody(event: APIGatewayProxyEvent): unknown | APIGatewayProxyResult {
  if (!event.body) {
    return jsonResponse(400, { message: 'Request body is required' });
  }

  try {
    return JSON.parse(event.body);
  } catch {
    return jsonResponse(400, { message: 'Invalid JSON in request body' });
  }
}

function isApiGatewayResult(value: unknown): value is APIGatewayProxyResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'statusCode' in value &&
    'body' in value
  );
}

function getHeader(headers: Record<string, string> | null | undefined, key: string): string | null {
  if (!headers) {
    return null;
  }

  const match = Object.entries(headers).find(
    ([header]) => header.toLowerCase() === key.toLowerCase(),
  );
  return match ? match[1] : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateCreateRequest(body: unknown): CreateConnectionRequest | string {
  if (!isObject(body)) {
    return 'Request body must be a JSON object';
  }

  if (typeof body.tenantId !== 'string' || body.tenantId.trim() === '') {
    return 'tenantId is required and must be a non-empty string';
  }
  if (typeof body.connectorKey !== 'string' || body.connectorKey.trim() === '') {
    return 'connectorKey is required and must be a non-empty string';
  }
  if (typeof body.displayName !== 'string' || body.displayName.trim() === '') {
    return 'displayName is required and must be a non-empty string';
  }
  if (body.authType !== 'oauth2' && body.authType !== 'apikey' && body.authType !== 'basic') {
    return 'authType must be one of oauth2, apikey, or basic';
  }
  if (!isObject(body.credentials)) {
    return 'credentials is required and must be an object';
  }
  if (
    body.scopes !== undefined &&
    (!Array.isArray(body.scopes) || body.scopes.some((scope) => typeof scope !== 'string'))
  ) {
    return 'scopes must be an array of strings';
  }

  return {
    tenantId: body.tenantId,
    connectorKey: body.connectorKey,
    displayName: body.displayName,
    authType: body.authType,
    credentials: body.credentials,
    createdBy: typeof body.createdBy === 'string' ? body.createdBy : undefined,
    scopes: Array.isArray(body.scopes) ? body.scopes : undefined,
  };
}

function validateRotateRequest(body: unknown): RotateConnectionRequest | string {
  if (!isObject(body)) {
    return 'Request body must be a JSON object';
  }

  if (typeof body.tenantId !== 'string' || body.tenantId.trim() === '') {
    return 'tenantId is required and must be a non-empty string';
  }
  if (!isObject(body.credentials)) {
    return 'credentials is required and must be an object';
  }

  return {
    tenantId: body.tenantId,
    credentials: body.credentials,
  };
}

export function createConnectionHandler(
  repo: ConnectionRepository,
  secrets: SecretsService,
  registry: Map<string, ConnectorDefinition>,
) {
  return async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    try {
      const parsed = parseJsonBody(event);
      if (isApiGatewayResult(parsed)) {
        return parsed;
      }

      const request = validateCreateRequest(parsed);
      if (typeof request === 'string') {
        return jsonResponse(400, { message: request });
      }

      const validation = validateCredentials(
        request.connectorKey,
        request.credentials,
        registry,
      );
      if (!validation.valid) {
        return jsonResponse(400, { errors: validation.errors });
      }

      const provisionalRecord = buildNewConnectionRecord(
        {
          tenantId: request.tenantId,
          connectorKey: request.connectorKey,
          displayName: request.displayName,
          authType: request.authType,
          secretRef: '',
          createdBy: request.createdBy ?? getHeader(event.headers, 'x-actor') ?? 'system',
          scopes: request.scopes,
        },
      );

      const secretName = buildSecretName(
        request.tenantId,
        provisionalRecord.connectionId,
      );
      const secretRef = await secrets.createSecret(secretName, request.credentials);
      const record = {
        ...provisionalRecord,
        secretRef,
      };

      await repo.create(record);

      return jsonResponse(201, {
        connectionId: record.connectionId,
        status: record.status,
        secretRef: record.secretRef,
      });
    } catch (error) {
      console.error('Error creating connection:', error);
      return jsonResponse(500, { message: 'Internal server error' });
    }
  };
}

export function testConnectionHandler(
  repo: ConnectionRepository,
  secrets: SecretsService,
  registry: Map<string, ConnectorDefinition>,
) {
  return async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    try {
      const connectionId = event.pathParameters?.id;
      const tenantId = event.queryStringParameters?.tenantId;

      if (!connectionId || !tenantId) {
        return jsonResponse(400, { message: 'Missing connectionId or tenantId' });
      }

      const connection = await repo.getById(tenantId, connectionId);
      if (!connection) {
        return jsonResponse(404, { message: 'Connection not found' });
      }

      const connector = registry.get(connection.connectorKey);
      if (!connector) {
        return jsonResponse(400, { message: 'Unknown connector' });
      }

      const credentials = await secrets.getSecretValue(connection.secretRef);
      const testResult = await connector.testFn(credentials, String(credentials.baseUrl ?? ''));
      const status = mapTestResultToStatus(testResult);
      const lastTestedAt = testResult.success ? new Date().toISOString() : connection.lastTestedAt;

      await repo.update(tenantId, connectionId, { status, lastTestedAt });

      return jsonResponse(200, {
        success: testResult.success,
        message: testResult.message,
      });
    } catch (error) {
      console.error('Error testing connection:', error);
      return jsonResponse(500, { message: 'Internal server error' });
    }
  };
}

export function listConnectionsHandler(repo: ConnectionRepository) {
  return async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    try {
      const tenantId = event.queryStringParameters?.tenantId;
      if (!tenantId) {
        return jsonResponse(400, { message: 'Missing tenantId' });
      }

      const connections = await repo.listByTenant(tenantId);
      return jsonResponse(200, {
        connections: connections.map(mapConnectionToListItem),
      });
    } catch (error) {
      console.error('Error listing connections:', error);
      return jsonResponse(500, { message: 'Internal server error' });
    }
  };
}

export function getDependenciesHandler(
  repo: ConnectionRepository,
  workflowRepo: WorkflowRepository,
) {
  return async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    try {
      const connectionId = event.pathParameters?.id;
      const tenantId = event.queryStringParameters?.tenantId;

      if (!connectionId || !tenantId) {
        return jsonResponse(400, { message: 'Missing connectionId or tenantId' });
      }

      const connection = await repo.getById(tenantId, connectionId);
      if (!connection) {
        return jsonResponse(404, { message: 'Connection not found' });
      }

      const workflows = await workflowRepo.listByTenant(tenantId);
      return jsonResponse(200, {
        workflows: filterDependentWorkflows(workflows, connectionId),
      });
    } catch (error) {
      console.error('Error getting dependencies:', error);
      return jsonResponse(500, { message: 'Internal server error' });
    }
  };
}

export function rotateConnectionHandler(
  repo: ConnectionRepository,
  secrets: SecretsService,
  registry: Map<string, ConnectorDefinition>,
  audit: AuditRepository,
) {
  return async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    try {
      const connectionId = event.pathParameters?.id;
      if (!connectionId) {
        return jsonResponse(400, { message: 'Missing connectionId' });
      }

      const parsed = parseJsonBody(event);
      if (isApiGatewayResult(parsed)) {
        return parsed;
      }

      const request = validateRotateRequest(parsed);
      if (typeof request === 'string') {
        return jsonResponse(400, { message: request });
      }

      const connection = await repo.getById(request.tenantId, connectionId);
      if (!connection) {
        return jsonResponse(404, { message: 'Connection not found' });
      }

      const validation = validateCredentials(
        connection.connectorKey,
        request.credentials,
        registry,
      );
      if (!validation.valid) {
        return jsonResponse(400, { errors: validation.errors });
      }

      const connector = registry.get(connection.connectorKey);
      if (!connector) {
        return jsonResponse(400, { message: 'Unknown connector' });
      }

      const testResult = await connector.testFn(
        request.credentials,
        String(request.credentials.baseUrl ?? ''),
      );
      if (!testResult.success) {
        return jsonResponse(422, {
          message: 'New credentials failed validation',
          detail: testResult.message,
        });
      }

      const now = new Date().toISOString();
      await secrets.putSecretValue(connection.secretRef, request.credentials);
      await repo.update(request.tenantId, connectionId, {
        status: 'active',
        updatedAt: now,
        lastTestedAt: now,
      });

      await audit.writeEntry(
        buildAuditEntry(
          request.tenantId,
          'CONNECTION_ROTATED',
          getHeader(event.headers, 'x-actor') ?? 'system',
          connectionId,
          getHeader(event.headers, 'x-forwarded-for') ?? 'unknown',
        ),
      );

      return jsonResponse(200, { success: true });
    } catch (error) {
      console.error('Error rotating connection:', error);
      return jsonResponse(500, { message: 'Internal server error' });
    }
  };
}

export function deleteConnectionHandler(
  repo: ConnectionRepository,
  secrets: SecretsService,
  workflowRepo: WorkflowRepository,
  audit: AuditRepository,
) {
  return async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    try {
      const connectionId = event.pathParameters?.id;
      const tenantId = event.queryStringParameters?.tenantId;

      if (!connectionId || !tenantId) {
        return jsonResponse(400, { message: 'Missing connectionId or tenantId' });
      }

      const connection = await repo.getById(tenantId, connectionId);
      if (!connection) {
        return jsonResponse(404, { message: 'Connection not found' });
      }

      const workflows = await workflowRepo.listByTenant(tenantId);
      const dependents = filterDependentWorkflows(workflows, connectionId);
      if (hasPublishedDependents(dependents)) {
        return jsonResponse(409, {
          message: 'Connection has published workflow dependencies',
        });
      }

      const deletedAt = new Date().toISOString();
      await secrets.scheduleDelete(connection.secretRef, 7);
      await repo.softDelete(tenantId, connectionId, deletedAt);
      await audit.writeEntry(
        buildAuditEntry(
          tenantId,
          'CONNECTION_DELETED',
          getHeader(event.headers, 'x-actor') ?? 'system',
          connectionId,
          getHeader(event.headers, 'x-forwarded-for') ?? 'unknown',
        ),
      );

      return {
        statusCode: 204,
        headers: JSON_HEADERS,
        body: '',
      };
    } catch (error) {
      console.error('Error deleting connection:', error);
      return jsonResponse(500, { message: 'Internal server error' });
    }
  };
}

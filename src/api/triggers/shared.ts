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

export const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function jsonResponse(
  statusCode: number,
  body: unknown,
): APIGatewayProxyResult {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

export function getHeader(
  headers: Record<string, string> | null | undefined,
  name: string,
): string | undefined {
  if (!headers) {
    return undefined;
  }

  const match = Object.entries(headers).find(
    ([headerName]) => headerName.toLowerCase() === name.toLowerCase(),
  );

  return match?.[1];
}

export function parseJsonBody(body: string | null | undefined): unknown | Error {
  if (!body) {
    return new Error('Request body is required');
  }

  try {
    return JSON.parse(body);
  } catch {
    return new Error('Invalid JSON in request body');
  }
}

export function resolveTenantId(
  event: APIGatewayProxyEvent,
  parsedBody?: Record<string, unknown>,
): string | null {
  const headerTenantId = getHeader(event.headers, 'x-tenant-id');
  if (typeof headerTenantId === 'string' && headerTenantId.trim() !== '') {
    return headerTenantId.trim();
  }

  if (typeof parsedBody?.tenantId === 'string' && parsedBody.tenantId.trim() !== '') {
    return parsedBody.tenantId.trim();
  }

  return null;
}

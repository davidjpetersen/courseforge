import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

export interface HttpActionParams {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: string;
  maxRetries?: number;
  initialDelayMs?: number;
}

export interface ConnectorContext {
  variables: Record<string, string>;
  workflowId: string;
  tenantId: string;
  traceId: string;
}

export interface HttpActionResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export class HttpActionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(message);
    this.name = 'HttpActionError';
  }
}

export interface HttpActionDeps {
  secretsClient: {
    send(command: GetSecretValueCommand): Promise<{ SecretString?: string }>;
  };
  httpClient?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  logger?: Pick<Console, 'log'>;
}

const SECRET_PATTERN = /\{\{secret:([^}]+)\}\}/g;
const CONTEXT_PATTERN = /\{\{context\.([^}]+)\}\}/g;

async function resolveSecrets(
  input: string,
  deps: HttpActionDeps,
  secretValues: string[],
): Promise<string> {
  let output = input;
  const matches = [...input.matchAll(SECRET_PATTERN)];

  for (const match of matches) {
    const secretId = match[1];
    const response = await deps.secretsClient.send(
      new GetSecretValueCommand({ SecretId: secretId }),
    );
    const secretValue = response.SecretString ?? '';
    secretValues.push(secretValue);
    output = output.replace(match[0], secretValue);
  }

  return output;
}

function resolveContext(input: string, context: ConnectorContext): string {
  return input.replace(CONTEXT_PATTERN, (_, fieldName: string) => {
    const contextValue =
      fieldName in context.variables
        ? context.variables[fieldName]
        : (context as unknown as Record<string, string>)[fieldName];

    return contextValue ?? '';
  });
}

function sanitizeLogValue(input: string, secretValues: string[]): string {
  return secretValues.reduce(
    (accumulator, secretValue) =>
      secretValue ? accumulator.split(secretValue).join('[REDACTED]') : accumulator,
    input,
  );
}

async function resolveTemplate(
  input: string | undefined,
  context: ConnectorContext,
  deps: HttpActionDeps,
  secretValues: string[],
): Promise<string | undefined> {
  if (typeof input !== 'string') {
    return undefined;
  }

  const withSecrets = await resolveSecrets(input, deps, secretValues);
  return resolveContext(withSecrets, context);
}

function shouldRetry(statusCode: number): boolean {
  return statusCode >= 500;
}

function responseHeadersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

export async function executeHttpAction(
  params: HttpActionParams,
  context: ConnectorContext,
  deps: HttpActionDeps,
): Promise<HttpActionResult> {
  const httpClient = deps.httpClient ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const logger = deps.logger ?? console;
  const secretValues: string[] = [];

  const resolvedUrl = await resolveTemplate(params.url, context, deps, secretValues);
  const resolvedBody = await resolveTemplate(params.body, context, deps, secretValues);

  const resolvedHeaders = Object.fromEntries(
    await Promise.all(
      Object.entries(params.headers ?? {}).map(async ([key, value]) => [
        key,
        (await resolveTemplate(value, context, deps, secretValues)) ?? '',
      ]),
    ),
  );

  const maxRetries = params.maxRetries ?? 3;
  const initialDelayMs = params.initialDelayMs ?? 200;

  let lastStatusCode = 0;
  let lastResponseBody = '';

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const startedAt = Date.now();

    try {
      const response = await httpClient(resolvedUrl!, {
        method: params.method,
        headers: resolvedHeaders,
        body: resolvedBody,
      });

      const responseBody = await response.text();
      const durationMs = Date.now() - startedAt;

      logger.log(
        JSON.stringify({
          traceId: context.traceId,
          method: params.method,
          url: sanitizeLogValue(resolvedUrl!, secretValues),
          statusCode: response.status,
          attempt,
          durationMs,
        }),
      );

      if (!response.ok) {
        lastStatusCode = response.status;
        lastResponseBody = responseBody;

        if (attempt < maxRetries && shouldRetry(response.status)) {
          await sleep(initialDelayMs * 2 ** (attempt - 1));
          continue;
        }

        throw new HttpActionError(
          `HTTP action failed with status ${response.status}`,
          response.status,
          responseBody,
        );
      }

      return {
        statusCode: response.status,
        headers: responseHeadersToObject(response.headers),
        body: responseBody,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;

      logger.log(
        JSON.stringify({
          traceId: context.traceId,
          method: params.method,
          url: sanitizeLogValue(resolvedUrl!, secretValues),
          statusCode:
            error instanceof HttpActionError ? error.statusCode : lastStatusCode || 0,
          attempt,
          durationMs,
        }),
      );

      if (error instanceof HttpActionError) {
        throw error;
      }

      if (attempt < maxRetries) {
        await sleep(initialDelayMs * 2 ** (attempt - 1));
        continue;
      }

      throw new HttpActionError(
        error instanceof Error ? error.message : 'HTTP action failed',
        lastStatusCode,
        lastResponseBody,
      );
    }
  }

  throw new HttpActionError(
    'HTTP action failed',
    lastStatusCode,
    lastResponseBody,
  );
}

export { GetSecretValueCommand, SecretsManagerClient };

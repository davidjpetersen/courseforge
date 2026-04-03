import { GetSecretValueCommand, SecretsManagerClient, } from '@aws-sdk/client-secrets-manager';
export class HttpActionError extends Error {
    statusCode;
    responseBody;
    constructor(message, statusCode, responseBody) {
        super(message);
        this.statusCode = statusCode;
        this.responseBody = responseBody;
        this.name = 'HttpActionError';
    }
}
const SECRET_PATTERN = /\{\{secret:([^}]+)\}\}/g;
const CONTEXT_PATTERN = /\{\{context\.([^}]+)\}\}/g;
async function resolveSecrets(input, deps, secretValues) {
    let output = input;
    const matches = [...input.matchAll(SECRET_PATTERN)];
    for (const match of matches) {
        const secretId = match[1];
        const response = await deps.secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
        const secretValue = response.SecretString ?? '';
        secretValues.push(secretValue);
        output = output.replace(match[0], secretValue);
    }
    return output;
}
function resolveContext(input, context) {
    return input.replace(CONTEXT_PATTERN, (_, fieldName) => {
        const contextValue = fieldName in context.variables
            ? context.variables[fieldName]
            : context[fieldName];
        return contextValue ?? '';
    });
}
function sanitizeLogValue(input, secretValues) {
    return secretValues.reduce((accumulator, secretValue) => secretValue ? accumulator.split(secretValue).join('[REDACTED]') : accumulator, input);
}
async function resolveTemplate(input, context, deps, secretValues) {
    if (typeof input !== 'string') {
        return undefined;
    }
    const withSecrets = await resolveSecrets(input, deps, secretValues);
    return resolveContext(withSecrets, context);
}
function shouldRetry(statusCode) {
    return statusCode >= 500;
}
function responseHeadersToObject(headers) {
    const result = {};
    headers.forEach((value, key) => {
        result[key] = value;
    });
    return result;
}
export async function executeHttpAction(params, context, deps) {
    const httpClient = deps.httpClient ?? fetch;
    const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const logger = deps.logger ?? console;
    const secretValues = [];
    const resolvedUrl = await resolveTemplate(params.url, context, deps, secretValues);
    const resolvedBody = await resolveTemplate(params.body, context, deps, secretValues);
    const resolvedHeaders = Object.fromEntries(await Promise.all(Object.entries(params.headers ?? {}).map(async ([key, value]) => [
        key,
        (await resolveTemplate(value, context, deps, secretValues)) ?? '',
    ])));
    const maxRetries = params.maxRetries ?? 3;
    const initialDelayMs = params.initialDelayMs ?? 200;
    let lastStatusCode = 0;
    let lastResponseBody = '';
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        const startedAt = Date.now();
        try {
            const response = await httpClient(resolvedUrl, {
                method: params.method,
                headers: resolvedHeaders,
                body: resolvedBody,
            });
            const responseBody = await response.text();
            const durationMs = Date.now() - startedAt;
            logger.log(JSON.stringify({
                traceId: context.traceId,
                method: params.method,
                url: sanitizeLogValue(resolvedUrl, secretValues),
                statusCode: response.status,
                attempt,
                durationMs,
            }));
            if (!response.ok) {
                lastStatusCode = response.status;
                lastResponseBody = responseBody;
                if (attempt < maxRetries && shouldRetry(response.status)) {
                    await sleep(initialDelayMs * 2 ** (attempt - 1));
                    continue;
                }
                throw new HttpActionError(`HTTP action failed with status ${response.status}`, response.status, responseBody);
            }
            return {
                statusCode: response.status,
                headers: responseHeadersToObject(response.headers),
                body: responseBody,
            };
        }
        catch (error) {
            const durationMs = Date.now() - startedAt;
            logger.log(JSON.stringify({
                traceId: context.traceId,
                method: params.method,
                url: sanitizeLogValue(resolvedUrl, secretValues),
                statusCode: error instanceof HttpActionError ? error.statusCode : lastStatusCode || 0,
                attempt,
                durationMs,
            }));
            if (error instanceof HttpActionError) {
                throw error;
            }
            if (attempt < maxRetries) {
                await sleep(initialDelayMs * 2 ** (attempt - 1));
                continue;
            }
            throw new HttpActionError(error instanceof Error ? error.message : 'HTTP action failed', lastStatusCode, lastResponseBody);
        }
    }
    throw new HttpActionError('HTTP action failed', lastStatusCode, lastResponseBody);
}
export { GetSecretValueCommand, SecretsManagerClient };
//# sourceMappingURL=index.js.map
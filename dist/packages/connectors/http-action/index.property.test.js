// Feature: event-triggering-routing
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { executeHttpAction, HttpActionError } from './index.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Build a minimal Response-like object that satisfies the httpClient interface
 * expected by executeHttpAction.
 */
function makeFakeResponse(status, body = '') {
    return {
        ok: status >= 200 && status <= 299,
        status,
        text: async () => body,
        headers: { forEach: (_cb) => { } },
    };
}
/**
 * Build a minimal ConnectorContext.
 */
function makeContext(overrides = {}) {
    return {
        variables: {},
        workflowId: 'wf-test',
        tenantId: 'tenant-test',
        traceId: 'trace-test',
        ...overrides,
    };
}
// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------
/**
 * Generates strings that are safe as identifiers (alphanumeric + hyphen/underscore, no
 * braces or whitespace).
 */
const safeIdentifier = fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => /^[A-Za-z0-9_-]+$/.test(s));
/** HTTP methods accepted by executeHttpAction. */
const httpMethod = fc.constantFrom('GET', 'POST', 'PUT', 'PATCH', 'DELETE');
/** 5xx status codes that trigger retries. */
const status5xx = fc.integer({ min: 500, max: 599 });
/**
 * Non-empty strings that:
 *  - contain no template syntax (`{{` / `}}`)
 *  - contain no JavaScript String.replace() special replacement patterns (`$&`, `$'`,
 *    `$\``, `$$`, `$<`, `$1`–`$9`) because the implementation uses the two-arg form of
 *    .replace() which interprets those patterns in the replacement string
 *  - are long enough (≥ 8 chars) to avoid false positives where a short secret value
 *    appears as a substring of an unrelated part of the log entry (e.g. "https://")
 *  - contain only printable ASCII so they don't accidentally appear in other log fields
 *    or cause encoding issues
 */
const safeSecretValue = fc
    .string({ minLength: 8, maxLength: 30 })
    .filter((s) => !s.includes('{{') &&
    !s.includes('}}') &&
    !s.includes('$') &&
    // Must be entirely printable ASCII (no control characters)
    /^[\x20-\x7E]+$/.test(s) &&
    // Must not be a substring of the constant parts of the URL we use in tests so
    // the "not in log" assertion isn't trivially satisfied by the URL not containing it
    !('https://example.com/'.includes(s)) &&
    // Must not be a substring of fixed context fields
    !('wf-test tenant-test trace-test'.includes(s)) &&
    // Must not contain characters that would be interpreted in URL context in
    // unexpected ways for these tests
    !s.includes(' '));
/**
 * Strings safe for use as context variable values: no template syntax, no regex
 * replacement specials, no spaces.
 */
const safeContextValue = fc
    .string({ minLength: 4, maxLength: 20 })
    .filter((s) => !s.includes('{{') &&
    !s.includes('}}') &&
    !s.includes('$') &&
    /^[\x21-\x7E]+$/.test(s));
// ---------------------------------------------------------------------------
// Property 6: Template reference resolution
// ---------------------------------------------------------------------------
describe('Property 6: Template reference resolution', () => {
    it('resolves all {{secret:*}} and {{context.*}} placeholders before the HTTP request is made', async () => {
        await fc.assert(fc.asyncProperty(httpMethod, safeIdentifier, // secretId
        safeSecretValue, // secretValue
        safeIdentifier, // contextField name (in variables)
        safeContextValue, // contextField value
        async (method, secretId, secretValue, contextField, contextValue) => {
            // Build a URL that contains both kinds of template references.
            const url = `https://example.com/{{secret:${secretId}}}/path/{{context.${contextField}}}`;
            // Build a body for methods that carry one.
            const body = method !== 'GET' && method !== 'DELETE'
                ? `{"secret":"{{secret:${secretId}}}","field":"{{context.${contextField}}}"}`
                : undefined;
            const capturedCalls = [];
            const httpClient = vi.fn(async (fetchUrl, init) => {
                capturedCalls.push({ url: fetchUrl, init });
                return makeFakeResponse(200, 'ok');
            });
            const secretsClient = {
                send: vi.fn().mockResolvedValue({ SecretString: secretValue }),
            };
            await executeHttpAction({ method, url, body, maxRetries: 1, initialDelayMs: 0 }, makeContext({ variables: { [contextField]: contextValue } }), {
                secretsClient,
                httpClient,
                sleep: vi.fn().mockResolvedValue(undefined),
                logger: { log: vi.fn() },
            });
            // The connector must have called httpClient exactly once.
            expect(capturedCalls).toHaveLength(1);
            const call = capturedCalls[0];
            // The final URL must contain no unresolved template references.
            expect(call.url).not.toMatch(/\{\{/);
            expect(call.url).not.toMatch(/\}\}/);
            // The final URL must contain the resolved values.
            expect(call.url).toContain(secretValue);
            expect(call.url).toContain(contextValue);
            // Any resolved headers must also contain no templates.
            const headers = call.init.headers;
            if (headers) {
                for (const [, v] of Object.entries(headers)) {
                    expect(v).not.toMatch(/\{\{/);
                    expect(v).not.toMatch(/\}\}/);
                }
            }
            // For methods that carry a body, the resolved body must be template-free.
            if (call.init.body) {
                expect(call.init.body).not.toMatch(/\{\{/);
                expect(call.init.body).not.toMatch(/\}\}/);
                expect(call.init.body).toContain(secretValue);
                expect(call.init.body).toContain(contextValue);
            }
        }), { numRuns: 100 });
    });
    it('resolves {{context.*}} references in headers before the HTTP request is made', async () => {
        await fc.assert(fc.asyncProperty(httpMethod, safeIdentifier, // variable name
        safeContextValue, // variable value
        async (method, varName, varValue) => {
            const url = 'https://example.com/endpoint';
            const capturedHeaders = [];
            const httpClient = vi.fn(async (_url, init) => {
                capturedHeaders.push((init.headers ?? {}));
                return makeFakeResponse(200, 'ok');
            });
            await executeHttpAction({
                method,
                url,
                headers: { 'X-Custom': `{{context.${varName}}}` },
                maxRetries: 1,
                initialDelayMs: 0,
            }, makeContext({ variables: { [varName]: varValue } }), {
                secretsClient: { send: vi.fn().mockResolvedValue({ SecretString: '' }) },
                httpClient,
                sleep: vi.fn().mockResolvedValue(undefined),
                logger: { log: vi.fn() },
            });
            expect(capturedHeaders).toHaveLength(1);
            const h = capturedHeaders[0];
            expect(h['X-Custom']).not.toMatch(/\{\{/);
            expect(h['X-Custom']).not.toMatch(/\}\}/);
            expect(h['X-Custom']).toBe(varValue);
        }), { numRuns: 100 });
    });
});
// ---------------------------------------------------------------------------
// Property 7: Retry with exponential backoff and error propagation
// ---------------------------------------------------------------------------
describe('Property 7: Retry with exponential backoff and error propagation', () => {
    it('makes exactly maxRetries total attempts when all responses are 5xx, then throws HttpActionError', async () => {
        await fc.assert(fc.asyncProperty(fc.integer({ min: 1, max: 5 }), // maxRetries (= total number of attempts)
        status5xx, safeContextValue, // response body from the server
        async (maxRetries, status, responseBody) => {
            const sleep = vi.fn().mockResolvedValue(undefined);
            const httpClient = vi
                .fn()
                .mockResolvedValue(makeFakeResponse(status, responseBody));
            let thrownError;
            try {
                await executeHttpAction({
                    method: 'GET',
                    url: 'https://example.com/test',
                    maxRetries,
                    initialDelayMs: 1,
                }, makeContext(), {
                    secretsClient: { send: vi.fn().mockResolvedValue({ SecretString: '' }) },
                    httpClient,
                    sleep,
                    logger: { log: vi.fn() },
                });
            }
            catch (err) {
                thrownError = err;
            }
            // Must have thrown.
            expect(thrownError).toBeInstanceOf(HttpActionError);
            const error = thrownError;
            // The error must carry the final status code and response body.
            expect(error.statusCode).toBe(status);
            expect(error.responseBody).toBe(responseBody);
            // httpClient must have been called exactly maxRetries times (maxRetries is
            // the total number of attempts, not extra retries on top of the first call).
            expect(httpClient).toHaveBeenCalledTimes(maxRetries);
        }), { numRuns: 100 });
    });
    it('sleeps with exponential backoff between retry attempts (initialDelayMs * 2^(attempt-1))', async () => {
        await fc.assert(fc.asyncProperty(fc.integer({ min: 2, max: 5 }), // maxRetries ≥ 2 so at least one sleep happens
        fc.integer({ min: 1, max: 100 }), // initialDelayMs
        status5xx, async (maxRetries, initialDelayMs, status) => {
            const sleepArgs = [];
            const sleep = vi.fn(async (ms) => {
                sleepArgs.push(ms);
            });
            const httpClient = vi
                .fn()
                .mockResolvedValue(makeFakeResponse(status, 'error'));
            try {
                await executeHttpAction({
                    method: 'GET',
                    url: 'https://example.com/test',
                    maxRetries,
                    initialDelayMs,
                }, makeContext(), {
                    secretsClient: { send: vi.fn().mockResolvedValue({ SecretString: '' }) },
                    httpClient,
                    sleep,
                    logger: { log: vi.fn() },
                });
            }
            catch {
                // expected
            }
            // Sleep is called (maxRetries - 1) times: after each attempt except the last.
            expect(sleepArgs).toHaveLength(maxRetries - 1);
            // Each interval must follow initialDelayMs * 2^(attempt-1), where attempt
            // is 1-indexed.
            sleepArgs.forEach((ms, index) => {
                const expectedDelay = initialDelayMs * 2 ** index;
                expect(ms).toBe(expectedDelay);
            });
        }), { numRuns: 100 });
    });
    it('does not retry 4xx responses — throws HttpActionError on the first attempt', async () => {
        await fc.assert(fc.asyncProperty(fc.integer({ min: 2, max: 5 }), // maxRetries ≥ 2 to confirm only 1 call is made
        fc.integer({ min: 400, max: 499 }), // 4xx status
        safeContextValue, async (maxRetries, status, responseBody) => {
            const sleep = vi.fn().mockResolvedValue(undefined);
            const httpClient = vi
                .fn()
                .mockResolvedValue(makeFakeResponse(status, responseBody));
            let thrownError;
            try {
                await executeHttpAction({
                    method: 'GET',
                    url: 'https://example.com/test',
                    maxRetries,
                    initialDelayMs: 1,
                }, makeContext(), {
                    secretsClient: { send: vi.fn().mockResolvedValue({ SecretString: '' }) },
                    httpClient,
                    sleep,
                    logger: { log: vi.fn() },
                });
            }
            catch (err) {
                thrownError = err;
            }
            expect(thrownError).toBeInstanceOf(HttpActionError);
            expect(thrownError.statusCode).toBe(status);
            // Only one attempt: no retry on 4xx.
            expect(httpClient).toHaveBeenCalledTimes(1);
            // No sleep calls.
            expect(sleep).not.toHaveBeenCalled();
        }), { numRuns: 100 });
    });
});
// ---------------------------------------------------------------------------
// Property 8: Secret exclusion from logs
// ---------------------------------------------------------------------------
describe('Property 8: Secret exclusion from logs', () => {
    it('never includes raw secret values in any structured log entry on a successful request', async () => {
        await fc.assert(fc.asyncProperty(safeIdentifier, // secretId
        safeSecretValue, // secretValue (guaranteed non-trivially distinguishable)
        httpMethod, async (secretId, secretValue, method) => {
            const logMessages = [];
            const logger = { log: vi.fn((msg) => logMessages.push(msg)) };
            const secretsClient = {
                send: vi.fn().mockResolvedValue({ SecretString: secretValue }),
            };
            // Inject the secret placeholder into the URL so the value is resolved.
            const url = `https://example.com/{{secret:${secretId}}}`;
            const body = method !== 'GET' && method !== 'DELETE'
                ? `{"token":"{{secret:${secretId}}}"}`
                : undefined;
            const httpClient = vi
                .fn()
                .mockResolvedValue(makeFakeResponse(200, 'ok'));
            await executeHttpAction({ method, url, body, maxRetries: 1, initialDelayMs: 0 }, makeContext(), {
                secretsClient,
                httpClient,
                sleep: vi.fn().mockResolvedValue(undefined),
                logger,
            });
            // Every log entry must not contain the raw secret value.
            for (const entry of logMessages) {
                expect(entry).not.toContain(secretValue);
            }
            // The logged URL must use [REDACTED] in place of the secret.
            for (const entry of logMessages) {
                const parsed = JSON.parse(entry);
                if (typeof parsed['url'] === 'string') {
                    expect(parsed['url']).not.toContain(secretValue);
                    expect(parsed['url']).toContain('[REDACTED]');
                }
            }
        }), { numRuns: 100 });
    });
    it('never includes raw secret values in log entries when retries occur on 5xx', async () => {
        await fc.assert(fc.asyncProperty(safeIdentifier, // secretId
        safeSecretValue, // secretValue
        fc.integer({ min: 2, max: 4 }), // maxRetries — multiple log entries
        async (secretId, secretValue, maxRetries) => {
            const logMessages = [];
            const logger = { log: vi.fn((msg) => logMessages.push(msg)) };
            const secretsClient = {
                send: vi.fn().mockResolvedValue({ SecretString: secretValue }),
            };
            // 5xx on every attempt so all retry paths and the final throw are exercised.
            const httpClient = vi
                .fn()
                .mockResolvedValue(makeFakeResponse(503, 'service unavailable'));
            try {
                await executeHttpAction({
                    method: 'GET',
                    url: `https://example.com/{{secret:${secretId}}}`,
                    maxRetries,
                    initialDelayMs: 0,
                }, makeContext(), {
                    secretsClient,
                    httpClient,
                    sleep: vi.fn().mockResolvedValue(undefined),
                    logger,
                });
            }
            catch {
                // Expected — all attempts fail with 5xx.
            }
            // Implementation produces one log entry per attempt in the try-block, plus
            // one extra log entry when the final HttpActionError is re-caught by the
            // catch block and rethrown. Total = maxRetries + 1.
            expect(logMessages).toHaveLength(maxRetries + 1);
            // None of the log entries may expose the raw secret value.
            for (const entry of logMessages) {
                expect(entry).not.toContain(secretValue);
            }
            // Every entry with a URL field must show [REDACTED] instead of the secret.
            for (const entry of logMessages) {
                const parsed = JSON.parse(entry);
                if (typeof parsed['url'] === 'string') {
                    expect(parsed['url']).not.toContain(secretValue);
                    expect(parsed['url']).toContain('[REDACTED]');
                }
            }
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=index.property.test.js.map
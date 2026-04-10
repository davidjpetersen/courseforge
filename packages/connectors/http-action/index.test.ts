import { describe, expect, it, vi } from 'vitest';
import {
  executeHttpAction,
  GetSecretValueCommand,
  HttpActionError,
} from './index';

function makeResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, { status, headers });
}

describe('executeHttpAction', () => {
  it('executes a successful request with context interpolation', async () => {
    const httpClient = vi.fn(async () => makeResponse(200, '{"ok":true}', { 'content-type': 'application/json' }));
    const result = await executeHttpAction(
      {
        method: 'POST',
        url: 'https://example.com/{{context.tenantId}}',
        headers: { Authorization: 'Bearer {{context.apiToken}}' },
        body: '{"workflow":"{{context.workflowId}}"}',
      },
      {
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        traceId: 'trace-1',
        variables: {
          apiToken: 'abc123',
        },
      },
      {
        secretsClient: {
          async send() {
            return {};
          },
        },
        httpClient,
        logger: { log: vi.fn() },
      },
    );

    expect(result.statusCode).toBe(200);
    expect(httpClient).toHaveBeenCalledWith(
      'https://example.com/tenant-1',
      expect.objectContaining({
        headers: { Authorization: 'Bearer abc123' },
      }),
    );
  });

  it('resolves secret references', async () => {
    const httpClient = vi.fn(async () => makeResponse(200, 'ok'));
    const send = vi.fn(async (command: GetSecretValueCommand) => {
      expect(command.input.SecretId).toBe('arn:aws:secretsmanager:secret:abc');
      return { SecretString: 'resolved-secret' };
    });

    await executeHttpAction(
      {
        method: 'GET',
        url: 'https://example.com',
        headers: {
          Authorization: 'Bearer {{secret:arn:aws:secretsmanager:secret:abc}}',
        },
      },
      {
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        traceId: 'trace-1',
        variables: {},
      },
      {
        secretsClient: { send },
        httpClient,
        logger: { log: vi.fn() },
      },
    );

    expect(send).toHaveBeenCalledOnce();
  });

  it('retries 5xx responses with exponential backoff', async () => {
    const sleep = vi.fn(async () => {});
    const httpClient = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(502, 'bad gateway'))
      .mockResolvedValueOnce(makeResponse(200, 'ok'));

    const result = await executeHttpAction(
      { method: 'GET', url: 'https://example.com', maxRetries: 2, initialDelayMs: 10 },
      {
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        traceId: 'trace-1',
        variables: {},
      },
      {
        secretsClient: { async send() { return {}; } },
        httpClient,
        sleep,
        logger: { log: vi.fn() },
      },
    );

    expect(result.statusCode).toBe(200);
    expect(httpClient).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it('does not retry 4xx responses', async () => {
    const httpClient = vi.fn(async () => makeResponse(400, 'bad request'));

    await expect(
      executeHttpAction(
        { method: 'GET', url: 'https://example.com', maxRetries: 3 },
        {
          tenantId: 'tenant-1',
          workflowId: 'wf-1',
          traceId: 'trace-1',
          variables: {},
        },
        {
          secretsClient: { async send() { return {}; } },
          httpClient,
          logger: { log: vi.fn() },
        },
      ),
    ).rejects.toBeInstanceOf(HttpActionError);

    expect(httpClient).toHaveBeenCalledTimes(1);
  });
});

import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import { createWebhookSecretHandler } from './webhook-secret.js';

describe('createWebhookSecretHandler', () => {
  it('returns a raw token and stores only its SHA-256 hash', async () => {
    let writtenItem: Record<string, unknown> | undefined;
    const handler = createWebhookSecretHandler({
      dynamoClient: {
        async put(params) {
          writtenItem = params.Item;
          return {};
        },
      },
      mainTableName: 'courseforge-main',
    });

    const response = await handler({
      httpMethod: 'POST',
      path: '/api/workflows/wf-1/webhook-secret',
      pathParameters: { workflowId: 'wf-1' },
      headers: { 'x-tenant-id': 'tenant-1' },
      body: null,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.token).toMatch(/^[a-f0-9]{64}$/);
    expect(writtenItem?.tokenHash).toBe(
      createHash('sha256').update(body.token).digest('hex'),
    );
    expect(writtenItem?.tokenHash).not.toBe(body.token);
  });
});

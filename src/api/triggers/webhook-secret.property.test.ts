// Feature: event-triggering-routing, Property 9: Webhook secret hash round-trip

import { createHash } from 'node:crypto';

import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import { createWebhookSecretHandler } from './webhook-secret.js';

const arbId = fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'), {
  minLength: 1,
  maxLength: 32,
});

describe('Property 9: Webhook secret hash round-trip', () => {
  it('SHA-256 hash of returned token equals stored tokenHash, and raw token is never stored', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({ workflowId: arbId, tenantId: arbId }),
        async ({ workflowId, tenantId }) => {
          let capturedItem: Record<string, unknown> | undefined;

          const put = vi.fn(async (params: { TableName: string; Item: Record<string, unknown> }) => {
            capturedItem = params.Item;
            return {};
          });

          const handler = createWebhookSecretHandler({
            dynamoClient: { put },
            mainTableName: 'courseforge-main',
          });

          const response = await handler({
            httpMethod: 'POST',
            path: `/triggers/${workflowId}/webhook-secret`,
            pathParameters: { workflowId },
            headers: { 'x-tenant-id': tenantId },
            body: null,
          });

          expect(response.statusCode).toBe(200);

          const body = JSON.parse(response.body) as { workflowId: string; token: string };
          expect(typeof body.token).toBe('string');
          expect(body.token.length).toBeGreaterThan(0);

          // The stored hash must equal SHA-256 of the returned raw token
          const expectedHash = createHash('sha256').update(body.token).digest('hex');
          expect(capturedItem?.tokenHash).toBe(expectedHash);

          // The stored item must NOT contain the raw token anywhere
          const storedJson = JSON.stringify(capturedItem);
          expect(storedJson).not.toContain(body.token);
        },
      ),
      { numRuns: 100 },
    );
  });
});

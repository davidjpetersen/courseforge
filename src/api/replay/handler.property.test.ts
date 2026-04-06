import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import { createReplayHandler } from './handler.js';

describe('Replay handler properties', () => {
  it('rejects any non-FAILED run status with 422', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('PENDING', 'RUNNING', 'SUCCESS'),
        async (status) => {
          const handler = createReplayHandler({
            dynamoClient: {
              query: vi.fn(async () => ({
                Items: [
                  {
                    runId: 'run-1',
                    workflowId: 'wf-1',
                    status,
                  },
                ],
              })),
              put: vi.fn(async () => ({})),
            },
            eventBridgeClient: { putEvents: vi.fn(async () => ({})) },
            mainTableName: 'courseforge-main',
            eventBusName: 'courseforge-domain',
          });

          const response = await handler({
            pathParameters: { runId: 'run-1' },
            requestContext: { authorizer: { tenantId: 'tenant-1' } },
          });

          expect(response.statusCode).toBe(422);
        },
      ),
      { numRuns: 50 },
    );
  });
});

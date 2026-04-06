import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { createNotificationHandler } from './handler.js';
const arbPrefs = fc.oneof(fc.constant(undefined), fc.record({
    workflowId: fc.constantFrom('all', 'wf-1', 'wf-2'),
}));
describe('Notification handler properties', () => {
    it('writes one notification per subscribed user', async () => {
        await fc.assert(fc.asyncProperty(fc.array(fc.record({
            userId: fc.string({ minLength: 1 }),
            notificationPrefs: arbPrefs,
        }), { maxLength: 40 }), async (users) => {
            const send = vi
                .fn()
                .mockResolvedValueOnce({ Items: users })
                .mockResolvedValue({});
            const handler = createNotificationHandler({
                dynamoClient: { send },
                mainTableName: 'courseforge-main',
                uuid: (() => {
                    let index = 0;
                    return () => `notif-${++index}`;
                })(),
            });
            await handler({
                detail: {
                    tenantId: 'tenant-1',
                    workflowId: 'wf-1',
                    runId: 'run-1',
                },
            });
            const subscribed = users.filter((user) => user.notificationPrefs?.workflowId === 'all' ||
                user.notificationPrefs?.workflowId === 'wf-1').length;
            const batchCalls = send.mock.calls
                .slice(1)
                .map((call) => call[0]);
            const written = batchCalls.reduce((count, command) => count + (command.input.RequestItems?.['courseforge-main']?.length ?? 0), 0);
            expect(written).toBe(subscribed);
        }), { numRuns: 50 });
    });
});
//# sourceMappingURL=handler.property.test.js.map
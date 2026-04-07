// Feature: event-triggering-routing
// Property 10: Cron expression syntax validation
// Property 11: Minimum schedule interval enforcement
// Property 12: Schedule creation produces complete outputs
// Property 13: Schedule deletion soft-deletes record
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { schedulePK, scheduleSK } from '../../models/schema.js';
import { createCreateScheduleHandler, createDeleteScheduleHandler } from './schedule.js';
// ── Shared helpers ──────────────────────────────────────────────────────────
const arbId = fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'), {
    minLength: 1,
    maxLength: 32,
});
function makeCreateDeps(overrides = {}) {
    const createSchedule = overrides.createSchedule ?? vi.fn(async () => ({}));
    const put = overrides.put ?? vi.fn(async () => ({}));
    return {
        deps: {
            dynamoClient: {
                async get() {
                    return {};
                },
                put: put,
                async update() {
                    return {};
                },
            },
            schedulerClient: {
                createSchedule: createSchedule,
                async deleteSchedule() {
                    return {};
                },
            },
            schedulesTableName: 'courseforge-schedules',
            scheduleGroupName: 'courseforge-schedules',
            targetArn: 'arn:aws:lambda:us-east-1:123:function:scheduled-trigger',
            targetRoleArn: 'arn:aws:iam::123:role/scheduler-target',
        },
        createSchedule,
        put,
    };
}
function makeDeleteDeps(existingItem = undefined) {
    const deleteSchedule = vi.fn(async () => ({}));
    const update = vi.fn(async () => ({}));
    return {
        deps: {
            dynamoClient: {
                async get() {
                    return existingItem !== undefined ? { Item: existingItem } : {};
                },
                async put() {
                    return {};
                },
                update,
            },
            schedulerClient: {
                async createSchedule() {
                    return {};
                },
                deleteSchedule,
            },
            schedulesTableName: 'courseforge-schedules',
            scheduleGroupName: 'courseforge-schedules',
        },
        deleteSchedule,
        update,
    };
}
// ── Property 10: Cron expression syntax validation ──────────────────────────
describe('Property 10: Cron expression syntax validation', () => {
    it('rejects strings with fewer than 5 whitespace-separated parts', async () => {
        // Generate strings that definitely cannot be valid 5- or 6-field cron expressions.
        // We produce strings with 0-4 space-separated tokens by building them from
        // non-whitespace words joined by a known delimiter count < 4.
        const arbFewFields = fc
            .tuple(fc.array(fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789*/'), {
            minLength: 1,
            maxLength: 8,
        }), { minLength: 0, maxLength: 4 }))
            .map(([parts]) => parts.join(' '));
        await fc.assert(fc.asyncProperty(fc.tuple(arbFewFields, arbId), async ([cronExpression, workflowId]) => {
            const { deps } = makeCreateDeps();
            const handler = createCreateScheduleHandler(deps);
            const response = await handler({
                httpMethod: 'POST',
                path: `/triggers/${workflowId}/schedules`,
                pathParameters: { workflowId },
                headers: { 'x-tenant-id': 'tenant-prop10' },
                body: JSON.stringify({ cronExpression }),
            });
            // Strings with < 5 fields are always invalid syntax → must be 400
            expect(response.statusCode).toBe(400);
        }), { numRuns: 100 });
    });
    it('accepts strings with 5 or 6 whitespace-separated fields as syntactically valid (may still be rejected for interval)', async () => {
        // Build a 5-field cron string with a valid-interval minutes field so we can
        // isolate syntax-only acceptance from interval rejection.
        const arbValidField = fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789*/'), { minLength: 1, maxLength: 6 });
        const arbFiveFields = fc
            .array(arbValidField, { minLength: 5, maxLength: 6 })
            .map((parts) => parts.join(' '));
        await fc.assert(fc.asyncProperty(fc.tuple(arbFiveFields, arbId), async ([cronExpression, workflowId]) => {
            const { deps } = makeCreateDeps();
            const handler = createCreateScheduleHandler(deps);
            const response = await handler({
                httpMethod: 'POST',
                path: `/triggers/${workflowId}/schedules`,
                pathParameters: { workflowId },
                headers: { 'x-tenant-id': 'tenant-prop10' },
                body: JSON.stringify({ cronExpression }),
            });
            // Must not be rejected with a *syntax* error message; it can still be
            // 400 for interval reasons, but the message must not say "Invalid cron expression syntax"
            // when the input has 5-6 fields.
            if (response.statusCode === 400) {
                const body = JSON.parse(response.body);
                expect(body.message).not.toBe('Invalid cron expression syntax');
            }
        }), { numRuns: 100 });
    });
});
// ── Property 11: Minimum schedule interval enforcement ──────────────────────
describe('Property 11: Minimum schedule interval enforcement', () => {
    it('rejects `* * * * *` (every minute)', async () => {
        await fc.assert(fc.asyncProperty(arbId, async (workflowId) => {
            const { deps } = makeCreateDeps();
            const handler = createCreateScheduleHandler(deps);
            const response = await handler({
                httpMethod: 'POST',
                path: `/triggers/${workflowId}/schedules`,
                pathParameters: { workflowId },
                headers: { 'x-tenant-id': 'tenant-prop11' },
                body: JSON.stringify({ cronExpression: '* * * * *' }),
            });
            expect(response.statusCode).toBe(400);
        }), { numRuns: 100 });
    });
    it('rejects */N where N is 1 through 14', async () => {
        const arbShortInterval = fc.integer({ min: 1, max: 14 }).map((n) => `*/${n} * * * *`);
        await fc.assert(fc.asyncProperty(fc.tuple(arbShortInterval, arbId), async ([cronExpression, workflowId]) => {
            const { deps } = makeCreateDeps();
            const handler = createCreateScheduleHandler(deps);
            const response = await handler({
                httpMethod: 'POST',
                path: `/triggers/${workflowId}/schedules`,
                pathParameters: { workflowId },
                headers: { 'x-tenant-id': 'tenant-prop11' },
                body: JSON.stringify({ cronExpression }),
            });
            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            expect(body.message).toBe('Schedules must be at least 15 minutes apart');
        }), { numRuns: 100 });
    });
});
// ── Property 12: Schedule creation produces complete outputs ─────────────────
describe('Property 12: Schedule creation produces complete outputs', () => {
    it('creates EventBridge schedule, writes DynamoDB record with correct keys, returns non-empty preview', async () => {
        const arbValidCron = fc.constantFrom('*/15 * * * *', '*/30 * * * *', '0 * * * *', '30 2 * * *');
        await fc.assert(fc.asyncProperty(fc.record({ cronExpression: arbValidCron, workflowId: arbId, tenantId: arbId }), async ({ cronExpression, workflowId, tenantId }) => {
            const createSchedule = vi.fn(async () => ({}));
            const put = vi.fn(async () => ({}));
            const { deps } = makeCreateDeps({ createSchedule, put });
            const handler = createCreateScheduleHandler(deps);
            const response = await handler({
                httpMethod: 'POST',
                path: `/triggers/${workflowId}/schedules`,
                pathParameters: { workflowId },
                headers: { 'x-tenant-id': tenantId },
                body: JSON.stringify({ cronExpression }),
            });
            expect(response.statusCode).toBe(200);
            // EventBridge scheduler must have been called exactly once
            expect(createSchedule).toHaveBeenCalledTimes(1);
            // DynamoDB put must have been called exactly once
            expect(put).toHaveBeenCalledTimes(1);
            // Verify DynamoDB item has correct PK/SK key pattern
            const putCall = put.mock.calls[0];
            const item = putCall[0].Item;
            expect(item.PK).toBe(schedulePK(workflowId));
            // SK must start with SCHEDULE# prefix (scheduleId is a UUID, so check prefix)
            const sk = item.SK;
            expect(sk.startsWith('SCHEDULE#')).toBe(true);
            const scheduleId = sk.slice('SCHEDULE#'.length);
            expect(item.SK).toBe(scheduleSK(scheduleId));
            // Response body must contain a non-empty preview string
            const body = JSON.parse(response.body);
            expect(typeof body.preview).toBe('string');
            expect(body.preview.trim().length).toBeGreaterThan(0);
        }), { numRuns: 100 });
    });
});
// ── Property 13: Schedule deletion soft-deletes record ──────────────────────
describe('Property 13: Schedule deletion soft-deletes record', () => {
    it('removes EventBridge schedule and sets deletedAt ISO 8601 timestamp on DynamoDB record', async () => {
        await fc.assert(fc.asyncProperty(fc.record({ workflowId: arbId, scheduleId: arbId }), async ({ workflowId, scheduleId }) => {
            const existingItem = { scheduleId, deletedAt: null, workflowId };
            const { deps, deleteSchedule, update } = makeDeleteDeps(existingItem);
            const handler = createDeleteScheduleHandler(deps);
            const response = await handler({
                httpMethod: 'DELETE',
                path: `/triggers/${workflowId}/schedules/${scheduleId}`,
                pathParameters: { workflowId, scheduleId },
                headers: null,
                body: null,
            });
            expect(response.statusCode).toBe(200);
            // EventBridge schedule must have been deleted exactly once
            expect(deleteSchedule).toHaveBeenCalledTimes(1);
            expect(deleteSchedule).toHaveBeenCalledWith({
                Name: scheduleId,
                GroupName: 'courseforge-schedules',
            });
            // DynamoDB update must have been called exactly once
            expect(update).toHaveBeenCalledTimes(1);
            // The update must set deletedAt to a valid ISO 8601 string (not physically delete)
            const updateCall = update.mock.calls[0];
            const { ExpressionAttributeValues } = updateCall[0];
            const deletedAt = ExpressionAttributeValues?.[':deletedAt'];
            expect(typeof deletedAt).toBe('string');
            const parsed = new Date(deletedAt);
            expect(Number.isNaN(parsed.getTime())).toBe(false);
            // Must round-trip as ISO 8601
            expect(deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
            // Response body must include deletedAt
            const body = JSON.parse(response.body);
            expect(body.deletedAt).toBe(deletedAt);
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=schedule.property.test.js.map
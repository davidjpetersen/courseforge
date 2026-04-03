import { describe, expect, it, vi } from 'vitest';
import { buildSchedulePreview, createCreateScheduleHandler, createDeleteScheduleHandler, } from './schedule.js';
describe('buildSchedulePreview', () => {
    it('renders interval-based previews', () => {
        expect(buildSchedulePreview('*/15 * * * *')).toBe('Runs every 15 minutes');
    });
});
describe('schedule handlers', () => {
    it('creates a schedule for a valid cron expression', async () => {
        const createSchedule = vi.fn(async () => ({}));
        const put = vi.fn(async () => ({}));
        const handler = createCreateScheduleHandler({
            dynamoClient: {
                async get() {
                    return {};
                },
                put,
                async update() {
                    return {};
                },
            },
            schedulerClient: {
                createSchedule,
                async deleteSchedule() {
                    return {};
                },
            },
            schedulesTableName: 'courseforge-schedules',
            scheduleGroupName: 'courseforge-schedules',
            targetArn: 'arn:aws:lambda:us-east-1:123:function:scheduled-trigger',
            targetRoleArn: 'arn:aws:iam::123:role/scheduler-target',
        });
        const response = await handler({
            httpMethod: 'POST',
            path: '/api/workflows/wf-1/schedule',
            pathParameters: { workflowId: 'wf-1' },
            headers: { 'x-tenant-id': 'tenant-1' },
            body: JSON.stringify({ cronExpression: '*/15 * * * *' }),
        });
        expect(response.statusCode).toBe(200);
        expect(createSchedule).toHaveBeenCalledOnce();
        expect(put).toHaveBeenCalledOnce();
    });
    it('rejects invalid cron expressions', async () => {
        const handler = createCreateScheduleHandler({
            dynamoClient: {
                async get() {
                    return {};
                },
                async put() {
                    return {};
                },
                async update() {
                    return {};
                },
            },
            schedulerClient: {
                async createSchedule() {
                    return {};
                },
                async deleteSchedule() {
                    return {};
                },
            },
            schedulesTableName: 'courseforge-schedules',
            scheduleGroupName: 'courseforge-schedules',
            targetArn: 'target',
            targetRoleArn: 'role',
        });
        const response = await handler({
            httpMethod: 'POST',
            path: '/api/workflows/wf-1/schedule',
            pathParameters: { workflowId: 'wf-1' },
            headers: { 'x-tenant-id': 'tenant-1' },
            body: JSON.stringify({ cronExpression: '* *' }),
        });
        expect(response.statusCode).toBe(400);
    });
    it('rejects schedules shorter than 15 minutes', async () => {
        const handler = createCreateScheduleHandler({
            dynamoClient: {
                async get() {
                    return {};
                },
                async put() {
                    return {};
                },
                async update() {
                    return {};
                },
            },
            schedulerClient: {
                async createSchedule() {
                    return {};
                },
                async deleteSchedule() {
                    return {};
                },
            },
            schedulesTableName: 'courseforge-schedules',
            scheduleGroupName: 'courseforge-schedules',
            targetArn: 'target',
            targetRoleArn: 'role',
        });
        const response = await handler({
            httpMethod: 'POST',
            path: '/api/workflows/wf-1/schedule',
            pathParameters: { workflowId: 'wf-1' },
            headers: { 'x-tenant-id': 'tenant-1' },
            body: JSON.stringify({ cronExpression: '*/5 * * * *' }),
        });
        expect(response.statusCode).toBe(400);
    });
    it('soft-deletes an existing schedule', async () => {
        const deleteSchedule = vi.fn(async () => ({}));
        const update = vi.fn(async () => ({}));
        const handler = createDeleteScheduleHandler({
            dynamoClient: {
                async get() {
                    return { Item: { scheduleId: 'sched-1', deletedAt: null } };
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
        });
        const response = await handler({
            httpMethod: 'DELETE',
            path: '/api/workflows/wf-1/schedule/sched-1',
            pathParameters: { workflowId: 'wf-1', scheduleId: 'sched-1' },
            headers: null,
            body: null,
        });
        expect(response.statusCode).toBe(200);
        expect(deleteSchedule).toHaveBeenCalledOnce();
        expect(update).toHaveBeenCalledOnce();
    });
    it('returns 404 when deleting a missing schedule', async () => {
        const handler = createDeleteScheduleHandler({
            dynamoClient: {
                async get() {
                    return {};
                },
                async put() {
                    return {};
                },
                async update() {
                    return {};
                },
            },
            schedulerClient: {
                async createSchedule() {
                    return {};
                },
                async deleteSchedule() {
                    return {};
                },
            },
            schedulesTableName: 'courseforge-schedules',
            scheduleGroupName: 'courseforge-schedules',
        });
        const response = await handler({
            httpMethod: 'DELETE',
            path: '/api/workflows/wf-1/schedule/sched-1',
            pathParameters: { workflowId: 'wf-1', scheduleId: 'sched-1' },
            headers: null,
            body: null,
        });
        expect(response.statusCode).toBe(404);
    });
});
//# sourceMappingURL=schedule.test.js.map
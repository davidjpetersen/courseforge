import { RunStatus } from '../../../packages/types/src/events.js';
export function isValidISODate(value) {
    return !isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}/.test(value);
}
export function clampLimit(value, max) {
    return Math.min(Math.max(1, value), max ?? 100);
}
export function encodeCursor(lastKey) {
    return Buffer.from(JSON.stringify(lastKey)).toString('base64');
}
export function decodeCursor(cursor) {
    try {
        return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
    }
    catch {
        return null;
    }
}
export function validateRunsQueryParams(raw) {
    const errors = [];
    const parsed = {};
    if (raw.workflowId !== undefined) {
        parsed.workflowId = raw.workflowId;
    }
    if (raw.status !== undefined) {
        const validStatuses = Object.values(RunStatus);
        if (validStatuses.includes(raw.status)) {
            parsed.status = raw.status;
        }
        else {
            errors.push('status must be one of: PENDING, RUNNING, SUCCESS, FAILED, REPLAYING');
        }
    }
    if (raw.dateFrom !== undefined) {
        if (isValidISODate(raw.dateFrom)) {
            parsed.dateFrom = raw.dateFrom;
        }
        else {
            errors.push('dateFrom must be a valid ISO 8601 date');
        }
    }
    if (raw.dateTo !== undefined) {
        if (isValidISODate(raw.dateTo)) {
            parsed.dateTo = raw.dateTo;
        }
        else {
            errors.push('dateTo must be a valid ISO 8601 date');
        }
    }
    if (raw.limit !== undefined) {
        const parsed_limit = parseInt(raw.limit, 10);
        if (isNaN(parsed_limit) || parsed_limit < 0) {
            errors.push('limit must be a positive integer');
        }
        else {
            parsed.limit = clampLimit(parsed_limit);
        }
    }
    if (raw.cursor !== undefined) {
        const decoded = decodeCursor(raw.cursor);
        if (decoded === null) {
            errors.push('cursor is invalid');
        }
        else {
            parsed.cursor = raw.cursor;
        }
    }
    return { valid: errors.length === 0, errors, parsed };
}
//# sourceMappingURL=validation.js.map
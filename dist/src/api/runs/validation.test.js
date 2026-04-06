import { describe, it, expect } from 'vitest';
import { isValidISODate, clampLimit, encodeCursor, decodeCursor, validateRunsQueryParams, } from './validation.js';
describe('isValidISODate', () => {
    it('accepts a plain date string', () => {
        expect(isValidISODate('2024-01-01')).toBe(true);
    });
    it('accepts a full ISO 8601 datetime string with Z', () => {
        expect(isValidISODate('2024-01-01T00:00:00Z')).toBe(true);
    });
    it('accepts a datetime with timezone offset', () => {
        expect(isValidISODate('2024-06-15T12:30:00+05:30')).toBe(true);
    });
    it('rejects a non-date string', () => {
        expect(isValidISODate('not-a-date')).toBe(false);
    });
    it('rejects an invalid month (13)', () => {
        expect(isValidISODate('2024-13-01')).toBe(false);
    });
    it('rejects an empty string', () => {
        expect(isValidISODate('')).toBe(false);
    });
});
describe('clampLimit', () => {
    it('clamps values below 1 to 1', () => {
        expect(clampLimit(0)).toBe(1);
        expect(clampLimit(-5)).toBe(1);
    });
    it('clamps values above 100 to 100', () => {
        expect(clampLimit(200)).toBe(100);
        expect(clampLimit(101)).toBe(100);
    });
    it('passes through normal values unchanged', () => {
        expect(clampLimit(50)).toBe(50);
        expect(clampLimit(1)).toBe(1);
        expect(clampLimit(100)).toBe(100);
    });
    it('respects a custom max', () => {
        expect(clampLimit(500, 250)).toBe(250);
        expect(clampLimit(10, 250)).toBe(10);
        expect(clampLimit(0, 250)).toBe(1);
    });
});
describe('encodeCursor / decodeCursor', () => {
    it('round-trips a sample object', () => {
        const obj = { pk: 'tenant#abc', sk: 'run#123' };
        expect(decodeCursor(encodeCursor(obj))).toEqual(obj);
    });
    it('round-trips an object with various value types', () => {
        const obj = { a: 'hello', b: 42, c: true };
        expect(decodeCursor(encodeCursor(obj))).toEqual(obj);
    });
    it('decodeCursor returns null on garbage input', () => {
        expect(decodeCursor('not-base64!!!')).toBeNull();
    });
    it('decodeCursor returns null on a valid base64 that is not JSON', () => {
        const notJson = Buffer.from('this is not json').toString('base64');
        expect(decodeCursor(notJson)).toBeNull();
    });
});
describe('validateRunsQueryParams', () => {
    it('returns valid for an empty params object', () => {
        const result = validateRunsQueryParams({});
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });
    it('accepts a valid status', () => {
        const result = validateRunsQueryParams({ status: 'PENDING' });
        expect(result.valid).toBe(true);
        expect(result.parsed.status).toBe('PENDING');
    });
    it('accepts all valid status values', () => {
        for (const status of ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'REPLAYING']) {
            const result = validateRunsQueryParams({ status });
            expect(result.valid).toBe(true);
        }
    });
    it('rejects an invalid status', () => {
        const result = validateRunsQueryParams({ status: 'DONE' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('status must be one of: PENDING, RUNNING, SUCCESS, FAILED, REPLAYING');
    });
    it('accepts a valid dateFrom', () => {
        const result = validateRunsQueryParams({ dateFrom: '2024-01-01' });
        expect(result.valid).toBe(true);
        expect(result.parsed.dateFrom).toBe('2024-01-01');
    });
    it('rejects an invalid dateFrom', () => {
        const result = validateRunsQueryParams({ dateFrom: 'yesterday' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('dateFrom must be a valid ISO 8601 date');
    });
    it('accepts a valid dateTo', () => {
        const result = validateRunsQueryParams({ dateTo: '2024-12-31T23:59:59Z' });
        expect(result.valid).toBe(true);
        expect(result.parsed.dateTo).toBe('2024-12-31T23:59:59Z');
    });
    it('rejects an invalid dateTo', () => {
        const result = validateRunsQueryParams({ dateTo: 'tomorrow' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('dateTo must be a valid ISO 8601 date');
    });
    it('clamps a limit above 100', () => {
        const result = validateRunsQueryParams({ limit: '200' });
        expect(result.valid).toBe(true);
        expect(result.parsed.limit).toBe(100);
    });
    it('clamps a limit of 0 to 1', () => {
        const result = validateRunsQueryParams({ limit: '0' });
        expect(result.valid).toBe(true);
        expect(result.parsed.limit).toBe(1);
    });
    it('rejects a non-integer limit', () => {
        const result = validateRunsQueryParams({ limit: 'abc' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('limit must be a positive integer');
    });
    it('rejects a negative limit', () => {
        const result = validateRunsQueryParams({ limit: '-5' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('limit must be a positive integer');
    });
    it('accepts a valid cursor', () => {
        const cursor = encodeCursor({ pk: 'abc', sk: '123' });
        const result = validateRunsQueryParams({ cursor });
        expect(result.valid).toBe(true);
        expect(result.parsed.cursor).toBe(cursor);
    });
    it('rejects an invalid cursor', () => {
        const result = validateRunsQueryParams({ cursor: 'not-base64!!!' });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('cursor is invalid');
    });
    it('accumulates multiple errors', () => {
        const result = validateRunsQueryParams({ status: 'INVALID', dateFrom: 'bad' });
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(2);
    });
});
//# sourceMappingURL=validation.test.js.map
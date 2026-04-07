import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  createQueryAuditHandler,
  type AuditFilters,
  type AuditRepository,
  type APIGatewayProxyEvent,
} from './handler.js';
import { ActionType, type AuditEntry, type ResourceType } from '../../../packages/types/src/audit.js';

// ── Arbitraries ──

const ACTION_TYPES = Object.values(ActionType);
const RESOURCE_TYPES: ResourceType[] = ['workflow', 'connection', 'run', 'user', 'environment'];

const arbActionType = fc.constantFrom(...ACTION_TYPES);
const arbResourceType = fc.constantFrom<ResourceType>(...RESOURCE_TYPES);

const arbAuditEntry: fc.Arbitrary<AuditEntry> = fc.record({
  auditId: fc.uuid(),
  tenantId: fc.constant('tenant-1'),
  actor: fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd'), { minLength: 1, maxLength: 8 }),
  actorEmail: fc.emailAddress(),
  actionType: arbActionType,
  resourceType: arbResourceType,
  resourceId: fc.stringOf(fc.constantFrom('r', 's', 't', '1', '2'), { minLength: 1, maxLength: 6 }),
  detail: fc.constant({} as Record<string, unknown>),
  ipAddress: fc.constant('127.0.0.1'),
  userAgent: fc.constant('test-agent'),
  timestamp: fc
    .date({ min: new Date('2024-01-01T00:00:00Z'), max: new Date('2024-12-31T23:59:59Z') })
    .map((d) => d.toISOString()),
});


// ── In-memory filter logic (reference implementation) ──

function matchesFilters(entry: AuditEntry, filters: AuditFilters): boolean {
  if (filters.actor && entry.actor !== filters.actor) return false;
  if (filters.actionType && entry.actionType !== filters.actionType) return false;
  if (filters.resourceType && entry.resourceType !== filters.resourceType) return false;
  if (filters.resourceId && entry.resourceId !== filters.resourceId) return false;
  if (filters.dateFrom && entry.timestamp < filters.dateFrom) return false;
  if (filters.dateTo && entry.timestamp > filters.dateTo) return false;
  return true;
}

// ── Mock repository that applies filters in-memory ──

function createInMemoryRepo(entries: AuditEntry[]): AuditRepository {
  // Sort entries by timestamp ascending (matching DynamoDB SK ordering)
  const sorted = [...entries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return {
    query: async (_tenantId: string, filters: AuditFilters) => {
      const filtered = sorted.filter((e) => matchesFilters(e, filters));
      const limit = filters.limit ?? 100;

      // Cursor-based pagination: cursor is the index into the filtered array
      let startIndex = 0;
      if (filters.cursor) {
        startIndex = parseInt(filters.cursor, 10);
        if (isNaN(startIndex) || startIndex < 0) startIndex = 0;
      }

      const page = filtered.slice(startIndex, startIndex + limit);
      const hasMore = startIndex + limit < filtered.length;

      return {
        entries: page,
        nextCursor: hasMore ? String(startIndex + limit) : undefined,
      };
    },
    queryAll: async (_tenantId: string, filters: AuditFilters) => {
      return sorted.filter((e) => matchesFilters(e, filters));
    },
  };
}

// ── Helper to build API Gateway event ──

function makeAdminEvent(
  queryParams: Record<string, string> = {},
): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/api/audit',
    headers: {
      'x-tenant-id': 'tenant-1',
      'x-user-role': 'Admin',
    },
    queryStringParameters: Object.keys(queryParams).length > 0 ? queryParams : null,
  };
}


// ── Property 10: Audit filter correctness ──

describe('Feature: env-separation-audit-log, Property 10: Audit filter correctness', () => {
  /**
   * Validates: Requirements 10.2
   *
   * For any set of audit entries and any combination of filter parameters,
   * the filtered result should contain only entries where every specified
   * filter criterion matches, and no matching entries should be excluded.
   */
  it('returns only entries matching all specified filters and excludes none that match', async () => {
    // Generate optional filter values drawn from the same pools as entries
    const arbFilters = fc.record({
      actor: fc.option(
        fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd'), { minLength: 1, maxLength: 8 }),
        { nil: undefined },
      ),
      actionType: fc.option(arbActionType, { nil: undefined }),
      resourceType: fc.option(arbResourceType, { nil: undefined }),
      resourceId: fc.option(
        fc.stringOf(fc.constantFrom('r', 's', 't', '1', '2'), { minLength: 1, maxLength: 6 }),
        { nil: undefined },
      ),
      dateFrom: fc.option(
        fc.date({ min: new Date('2024-01-01T00:00:00Z'), max: new Date('2024-06-30T23:59:59Z') })
          .map((d) => d.toISOString()),
        { nil: undefined },
      ),
      dateTo: fc.option(
        fc.date({ min: new Date('2024-07-01T00:00:00Z'), max: new Date('2024-12-31T23:59:59Z') })
          .map((d) => d.toISOString()),
        { nil: undefined },
      ),
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(arbAuditEntry, { minLength: 0, maxLength: 30 }),
        arbFilters,
        async (entries, filters) => {
          const repo = createInMemoryRepo(entries);
          const handler = createQueryAuditHandler(repo);

          // Build query params (only include defined filters)
          const queryParams: Record<string, string> = {};
          if (filters.actor !== undefined) queryParams.actor = filters.actor;
          if (filters.actionType !== undefined) queryParams.actionType = filters.actionType;
          if (filters.resourceType !== undefined) queryParams.resourceType = filters.resourceType;
          if (filters.resourceId !== undefined) queryParams.resourceId = filters.resourceId;
          if (filters.dateFrom !== undefined) queryParams.dateFrom = filters.dateFrom;
          if (filters.dateTo !== undefined) queryParams.dateTo = filters.dateTo;
          // Use a high limit to get all results in one page
          queryParams.limit = '1000';

          const event = makeAdminEvent(queryParams);
          const response = await handler(event);

          expect(response.statusCode).toBe(200);
          const body = JSON.parse(response.body);
          const returned: AuditEntry[] = body.entries;

          // Compute expected set using reference filter
          const expected = entries.filter((e) => matchesFilters(e, {
            actor: filters.actor,
            actionType: filters.actionType,
            resourceType: filters.resourceType,
            resourceId: filters.resourceId,
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
          }));

          // Every returned entry must match all filters
          for (const entry of returned) {
            if (filters.actor !== undefined) expect(entry.actor).toBe(filters.actor);
            if (filters.actionType !== undefined) expect(entry.actionType).toBe(filters.actionType);
            if (filters.resourceType !== undefined) expect(entry.resourceType).toBe(filters.resourceType);
            if (filters.resourceId !== undefined) expect(entry.resourceId).toBe(filters.resourceId);
            if (filters.dateFrom !== undefined) expect(entry.timestamp >= filters.dateFrom).toBe(true);
            if (filters.dateTo !== undefined) expect(entry.timestamp <= filters.dateTo).toBe(true);
          }

          // No matching entries should be excluded
          const returnedIds = new Set(returned.map((e) => e.auditId));
          for (const entry of expected) {
            expect(returnedIds.has(entry.auditId)).toBe(true);
          }

          // Count must match
          expect(returned.length).toBe(expected.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ── Property 11: Audit pagination correctness ──

describe('Feature: env-separation-audit-log, Property 11: Audit pagination correctness', () => {
  /**
   * Validates: Requirements 10.3
   *
   * For any set of N audit entries queried with a limit L where L < N,
   * the first page should contain at most L entries and a non-null nextCursor.
   * Using that cursor to fetch the next page should return entries that do not
   * overlap with the first page, and the union of all pages should equal the
   * full result set.
   */
  it('pages do not overlap and their union equals the full result set', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate between 2 and 30 entries so we always have enough for pagination
        fc.array(arbAuditEntry, { minLength: 2, maxLength: 30 }),
        async (entries) => {
          // Deduplicate by auditId to avoid ambiguity
          const uniqueEntries = [
            ...new Map(entries.map((e) => [e.auditId, e])).values(),
          ];
          if (uniqueEntries.length < 2) return; // need at least 2 for L < N

          const repo = createInMemoryRepo(uniqueEntries);
          const handler = createQueryAuditHandler(repo);

          const totalCount = uniqueEntries.length;
          // Pick a limit that is strictly less than total count
          const limit = Math.max(1, Math.floor(totalCount / 2));

          // Collect all pages
          const allPageEntries: AuditEntry[] = [];
          let cursor: string | undefined = undefined;
          let pageCount = 0;
          const maxPages = totalCount + 1; // safety bound

          do {
            const queryParams: Record<string, string> = { limit: String(limit) };
            if (cursor) queryParams.cursor = cursor;

            const event = makeAdminEvent(queryParams);
            const response = await handler(event);

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            const pageEntries: AuditEntry[] = body.entries;

            // Each page should have at most L entries
            expect(pageEntries.length).toBeLessThanOrEqual(limit);

            allPageEntries.push(...pageEntries);
            cursor = body.nextCursor ?? undefined;
            pageCount++;
          } while (cursor && pageCount < maxPages);

          // First page should have had a nextCursor (since limit < totalCount)
          // (already verified implicitly by the loop continuing)

          // No overlap: all auditIds across pages should be unique
          const allIds = allPageEntries.map((e) => e.auditId);
          const uniqueIds = new Set(allIds);
          expect(uniqueIds.size).toBe(allIds.length);

          // Union equals full result set
          const expectedIds = new Set(uniqueEntries.map((e) => e.auditId));
          expect(uniqueIds.size).toBe(expectedIds.size);
          for (const id of expectedIds) {
            expect(uniqueIds.has(id)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

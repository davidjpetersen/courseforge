import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { formatAuditCsv } from './csv';
import { ActionType, type AuditEntry, type ResourceType } from '../../../packages/types/src/audit';

// ── Arbitraries ──

const ACTION_TYPES = Object.values(ActionType);
const RESOURCE_TYPES: ResourceType[] = ['workflow', 'connection', 'run', 'user', 'environment'];

const arbActionType = fc.constantFrom(...ACTION_TYPES);
const arbResourceType = fc.constantFrom<ResourceType>(...RESOURCE_TYPES);

const arbAuditEntry: fc.Arbitrary<AuditEntry> = fc.record({
  auditId: fc.uuid(),
  tenantId: fc.string({ minLength: 1, maxLength: 20 }),
  actor: fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', '@', '.'), { minLength: 1, maxLength: 12 }),
  actorEmail: fc.emailAddress(),
  actionType: arbActionType,
  resourceType: arbResourceType,
  resourceId: fc.string({ minLength: 1, maxLength: 20 }),
  detail: fc.oneof(
    fc.constant({} as Record<string, unknown>),
    fc.constant({ key: 'value' } as Record<string, unknown>),
    fc.constant({ count: 42, nested: { a: 1 } } as Record<string, unknown>),
  ),
  ipAddress: fc.constant('127.0.0.1'),
  userAgent: fc.constant('test-agent'),
  timestamp: fc
    .date({ min: new Date('2024-01-01T00:00:00Z'), max: new Date('2024-12-31T23:59:59Z') })
    .map((d) => d.toISOString()),
});

// ── CSV row parser that handles quoted fields ──

function parseCsvRow(row: string): string[] {
  const fields: string[] = [];
  let i = 0;

  while (i < row.length) {
    if (row[i] === '"') {
      // Quoted field
      let value = '';
      i++; // skip opening quote
      while (i < row.length) {
        if (row[i] === '"') {
          if (i + 1 < row.length && row[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          value += row[i];
          i++;
        }
      }
      fields.push(value);
      if (i < row.length && row[i] === ',') i++; // skip comma
    } else {
      // Unquoted field
      const start = i;
      while (i < row.length && row[i] !== ',') i++;
      fields.push(row.substring(start, i));
      if (i < row.length) i++; // skip comma
    }
  }

  return fields;
}

const EXPECTED_HEADERS = ['timestamp', 'actor', 'actorEmail', 'actionType', 'resourceType', 'resourceId', 'detail'];

// ── Property 12: CSV format correctness ──

describe('Feature: env-separation-audit-log, Property 12: CSV format correctness', () => {
  /**
   * Validates: Requirements 11.3
   *
   * For any set of audit entries, formatting them as CSV should produce output where:
   * - Every row contains exactly 7 columns
   * - The header row matches the expected column names
   * - Each data row's values correspond to the source entry's fields
   */
  it('produces CSV with correct header, 7 columns per row, and values matching source entries', () => {
    fc.assert(
      fc.property(
        fc.array(arbAuditEntry, { minLength: 0, maxLength: 30 }),
        (entries) => {
          const csv = formatAuditCsv(entries);
          const lines = csv.split('\n');

          // There should be exactly 1 header + N data rows
          expect(lines.length).toBe(1 + entries.length);

          // Header row has exactly 7 columns matching expected names
          const headerFields = parseCsvRow(lines[0]!);
          expect(headerFields).toEqual(EXPECTED_HEADERS);

          // Each data row has exactly 7 columns with correct values
          for (let i = 0; i < entries.length; i++) {
            const row = lines[i + 1]!;
            const fields = parseCsvRow(row);

            expect(fields.length).toBe(7);

            const entry = entries[i]!;
            expect(fields[0]).toBe(entry.timestamp);
            expect(fields[1]).toBe(entry.actor);
            expect(fields[2]).toBe(entry.actorEmail);
            expect(fields[3]).toBe(entry.actionType);
            expect(fields[4]).toBe(entry.resourceType);
            expect(fields[5]).toBe(entry.resourceId);
            expect(fields[6]).toBe(JSON.stringify(entry.detail));
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

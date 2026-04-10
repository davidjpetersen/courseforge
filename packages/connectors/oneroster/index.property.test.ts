import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyFieldMappings,
  BatchSyncThresholdError,
  buildEnrollmentsUrl,
  buildUserIdBatches,
  ensureErrorThreshold,
  filterEnrollmentsByOrg,
  type FieldMapping,
} from './index';

const baseUrlArbitrary = fc.webUrl().filter((url) => {
  try {
    const parsed = new URL(url);
    return parsed.origin === url || `${parsed.origin}/` === url;
  } catch {
    return false;
  }
});

const isoTimestampArbitrary = fc.date().map((date) => date.toISOString());
const safeKeyArbitrary = fc.string({ minLength: 1, maxLength: 12 }).filter((value) =>
  /^[A-Za-z][A-Za-z0-9_]*$/.test(value),
);
const safeValueArbitrary = fc.oneof(fc.string(), fc.integer(), fc.boolean());

describe('OneRoster properties', () => {
  it('property 1: buildEnrollmentsUrl adds the delta filter only when since is provided', () => {
    fc.assert(
      fc.property(baseUrlArbitrary, fc.option(isoTimestampArbitrary, { nil: undefined }), (baseUrl, since) => {
        const url = new URL(buildEnrollmentsUrl(baseUrl, since));

        expect(url.pathname).toBe('/ims/oneroster/v1p1/enrollments');
        if (since === undefined) {
          expect(url.searchParams.has('filter')).toBe(false);
        } else {
          expect(url.searchParams.get('filter')).toBe(`dateLastModified>'${since}'`);
        }
      }),
    );
  });

  it('property 2: filterEnrollmentsByOrg keeps all and only matching records', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            sourcedId: fc.uuid(),
            schoolSourcedId: fc.string({ minLength: 1, maxLength: 12 }),
          }),
          { maxLength: 100 },
        ),
        fc.string({ minLength: 1, maxLength: 12 }),
        (enrollments, targetOrgId) => {
          const filtered = filterEnrollmentsByOrg(enrollments, targetOrgId);
          const expected = enrollments.filter((item) => item.schoolSourcedId === targetOrgId);

          expect(filtered).toEqual(expected);
          expect(filtered.every((item) => item.schoolSourcedId === targetOrgId)).toBe(true);
        },
      ),
    );
  });

  it('property 3: buildUserIdBatches deduplicates non-empty ids and chunks them to 50', () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 200 }), (userIds) => {
        const batches = buildUserIdBatches(userIds);
        const flattened = batches.flat();
        const expected = [...new Set(userIds)].filter(Boolean);

        expect(batches.every((batch) => batch.length <= 50)).toBe(true);
        expect(flattened).toEqual(expected);
        expect(new Set(flattened).size).toBe(flattened.length);
        expect(flattened.every(Boolean)).toBe(true);
      }),
    );
  });

  it('property 4: applyFieldMappings returns exactly the mapped target fields that exist on the input', () => {
    fc.assert(
      fc.property(
        fc.dictionary(safeKeyArbitrary, safeValueArbitrary),
        fc.array(
          fc.record({
            sourceField: safeKeyArbitrary,
            targetField: safeKeyArbitrary,
          }),
          { maxLength: 30 },
        ),
        (record, mappings) => {
          const mapped = applyFieldMappings(record, mappings as FieldMapping[]);
          const expected: Record<string, unknown> = {};

          for (const mapping of mappings) {
            if (Object.prototype.hasOwnProperty.call(record, mapping.sourceField)) {
              expected[mapping.targetField] = record[mapping.sourceField];
            }
          }

          expect(mapped).toEqual(expected);
          expect(Object.keys(mapped).sort()).toEqual(Object.keys(expected).sort());
        },
      ),
    );
  });

  it('property 5: ensureErrorThreshold matches the 20% failure rule', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 0, max: 200 }),
        (total, errorCountCandidate) => {
          const errorCount = Math.min(total, errorCountCandidate);
          const shouldThrow = total > 0 && errorCount / total > 0.2;

          if (shouldThrow) {
            try {
              ensureErrorThreshold(total, errorCount);
              throw new Error('Expected ensureErrorThreshold to throw');
            } catch (error) {
              expect(error).toBeInstanceOf(BatchSyncThresholdError);
              const thresholdError = error as BatchSyncThresholdError;
              expect(thresholdError.total).toBe(total);
              expect(thresholdError.errorRate).toBe(errorCount / total);
            }
          } else {
            expect(() => ensureErrorThreshold(total, errorCount)).not.toThrow();
          }
        },
      ),
    );
  });
});

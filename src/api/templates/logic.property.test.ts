import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { filterByCategory, detectMissingConnections } from './logic';
import type { Template } from '../../models/types';

// ── Generators ──

const VALID_CATEGORIES = [
  'Roster Ops',
  'Course Lifecycle',
  'Notifications',
  'Analytics',
  'Assessment',
];

/** Generates a random non-empty subset of valid categories. */
const arbCategories: fc.Arbitrary<string[]> = fc
  .subarray(VALID_CATEGORIES, { minLength: 1, maxLength: VALID_CATEGORIES.length })
  .map((arr) => [...new Set(arr)]);

/** Generates a random (possibly empty) subset of valid categories for filtering. */
const arbCategoryFilter: fc.Arbitrary<string[]> = fc
  .subarray(VALID_CATEGORIES, { minLength: 0, maxLength: VALID_CATEGORIES.length })
  .map((arr) => [...new Set(arr)]);

/** Generates a minimal Template with the given categories. */
function arbTemplate(): fc.Arbitrary<Template> {
  return fc.tuple(
    fc.uuid(),
    fc.string({ minLength: 1, maxLength: 40 }),
    fc.string({ minLength: 0, maxLength: 100 }),
    arbCategories,
    fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 4 }),
  ).map(([id, name, description, categories, connectedSystems]) => ({
    templateId: id,
    name,
    description,
    categories,
    connectedSystems: [...new Set(connectedSystems)],
    requiredParameters: [],
    timeToActivate: '5 min',
    educationStandardTags: [],
    steps: [],
    certified: true,
    createdAt: '2024-01-01T00:00:00Z',
  }));
}

/** Generates a list of 0–10 templates. */
const arbTemplateList: fc.Arbitrary<Template[]> = fc.array(arbTemplate(), {
  minLength: 0,
  maxLength: 10,
});

/** Generates a random set of connection names. */
const arbConnectionSet: fc.Arbitrary<string[]> = fc
  .array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 6 })
  .map((arr) => [...new Set(arr)]);

// ── Property 12: Category Filtering Returns Correct Subset ──

describe('Feature: recipe-library, Property 12: Category Filtering Returns Correct Subset', () => {
  /**
   * **Validates: Requirements 7.2, 7.3**
   *
   * For any set of templates and any set of selected category filters
   * (including the empty set), the filtered result should contain exactly
   * the templates that have at least one category in the selected set —
   * or all templates if the selected set is empty.
   */
  it('returns exactly the correct subset for any templates and category filter', () => {
    fc.assert(
      fc.property(
        arbTemplateList,
        arbCategoryFilter,
        (templates, selectedCategories) => {
          const result = filterByCategory(templates, selectedCategories);

          if (selectedCategories.length === 0) {
            // Empty filter → all templates returned
            expect(result).toEqual(templates);
          } else {
            const categorySet = new Set(selectedCategories);

            // Every returned template must match at least one selected category
            for (const t of result) {
              expect(
                t.categories.some((c) => categorySet.has(c)),
              ).toBe(true);
            }

            // Every template that matches must be in the result
            for (const t of templates) {
              const shouldMatch = t.categories.some((c) => categorySet.has(c));
              const isInResult = result.includes(t);
              expect(isInResult).toBe(shouldMatch);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 4: Missing Connection Detection ──

describe('Feature: recipe-library, Property 4: Missing Connection Detection', () => {
  /**
   * **Validates: Requirements 2.3**
   *
   * For any template and any tenant connection set, the reported missing
   * connections should equal the set difference between the template's
   * required connected systems and the tenant's configured connections.
   */
  it('returns the exact set difference for any template systems and tenant connections', () => {
    fc.assert(
      fc.property(
        arbConnectionSet,
        arbConnectionSet,
        (templateSystems, tenantConnections) => {
          const missing = detectMissingConnections(
            templateSystems,
            tenantConnections,
          );

          const tenantSet = new Set(tenantConnections);
          const expectedMissing = templateSystems.filter(
            (sys) => !tenantSet.has(sys),
          );

          // Same elements in same order (filter preserves order)
          expect(missing).toEqual(expectedMissing);

          // No missing connection should be in the tenant set
          for (const m of missing) {
            expect(tenantSet.has(m)).toBe(false);
          }

          // Every template system not in missing must be configured
          for (const sys of templateSystems) {
            if (!missing.includes(sys)) {
              expect(tenantSet.has(sys)).toBe(true);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

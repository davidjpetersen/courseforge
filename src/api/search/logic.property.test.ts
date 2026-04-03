import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { searchTemplates } from './logic.js';
import type { Template } from '../../models/types.js';

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

/** Generates a search query — either empty or a non-empty alphanumeric string. */
const arbSearchQuery: fc.Arbitrary<string> = fc.oneof(
  fc.constant(''),
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz '.split('')), {
    minLength: 1,
    maxLength: 30,
  }),
);

/** Generates a minimal Template with random name, description, and categories. */
function arbTemplate(): fc.Arbitrary<Template> {
  return fc
    .tuple(
      fc.uuid(),
      fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz '.split('')), {
        minLength: 1,
        maxLength: 40,
      }),
      fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz '.split('')), {
        minLength: 0,
        maxLength: 80,
      }),
      arbCategories,
    )
    .map(([id, name, description, categories]) => ({
      templateId: id,
      name,
      description,
      categories,
      connectedSystems: [],
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

// ── Property 14: Combined Search and Filter Returns Intersection ──

describe('Feature: recipe-library, Property 14: Combined Search and Filter Returns Intersection', () => {
  /**
   * **Validates: Requirements 8.2, 8.3, 8.5**
   *
   * For any set of templates, any search query, and any set of selected
   * category filters, the result should be the intersection of templates
   * matching the search query (by name or description) and templates
   * matching the selected categories — with empty query meaning no search
   * restriction and empty categories meaning no category restriction.
   */
  it('returns the intersection of query-matched and category-matched templates', () => {
    fc.assert(
      fc.property(
        arbTemplateList,
        arbSearchQuery,
        arbCategoryFilter,
        (templates, query, categories) => {
          const result = searchTemplates(templates, query, categories);
          const normalizedQuery = query.trim().toLowerCase();
          const categorySet = new Set(categories);

          // Compute expected sets independently
          const matchesQuery = (t: Template): boolean =>
            normalizedQuery === '' ||
            t.name.toLowerCase().includes(normalizedQuery) ||
            t.description.toLowerCase().includes(normalizedQuery);

          const matchesCategory = (t: Template): boolean =>
            categorySet.size === 0 ||
            t.categories.some((c) => categorySet.has(c));

          // Expected: intersection of both predicates
          const expected = templates.filter(
            (t) => matchesQuery(t) && matchesCategory(t),
          );

          // Same length
          expect(result.length).toBe(expected.length);

          // Every result must satisfy both predicates
          for (const t of result) {
            expect(matchesQuery(t)).toBe(true);
            expect(matchesCategory(t)).toBe(true);
          }

          // Every template satisfying both predicates must be in the result
          for (const t of expected) {
            expect(result).toContain(t);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

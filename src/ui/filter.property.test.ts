import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  createFilterState,
  saveFilterState,
  loadFilterState,
  getSelectedCategories,
  VALID_CATEGORIES,
  type Storage,
  type Category,
  type FilterState,
} from './filter';

// ── In-memory mock storage ──

function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
}

// ── Generators ──

const arbCategorySubset: fc.Arbitrary<Category[]> = fc
  .subarray([...VALID_CATEGORIES], { minLength: 0, maxLength: VALID_CATEGORIES.length })
  .map((arr) => [...new Set(arr)] as Category[]);

// ── Property 13: Filter State Session Round-Trip ──

describe('Feature: recipe-library, Property 13: Filter State Session Round-Trip', () => {
  /**
   * **Validates: Requirements 7.4, 7.5**
   *
   * For any set of selected category filters, persisting them to session
   * storage and then reading them back should produce an identical set.
   */
  it('round-trips any category selection through session storage', () => {
    fc.assert(
      fc.property(arbCategorySubset, (categories) => {
        const storage = createMockStorage();

        // Build a FilterState with the given categories
        const state: FilterState = {
          selectedCategories: new Set(categories),
        };

        // Persist and restore
        saveFilterState(storage, state);
        const restored = loadFilterState(storage);

        // The restored set must be identical
        const originalSorted = getSelectedCategories(state).sort();
        const restoredSorted = getSelectedCategories(restored).sort();
        expect(restoredSorted).toEqual(originalSorted);
      }),
      { numRuns: 100 },
    );
  });
});

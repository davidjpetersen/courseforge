import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { saveFilterState, loadFilterState, getSelectedCategories, VALID_CATEGORIES, } from './filter.js';
// ── In-memory mock storage ──
function createMockStorage() {
    const store = new Map();
    return {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => store.set(key, value),
        removeItem: (key) => store.delete(key),
    };
}
// ── Generators ──
const arbCategorySubset = fc
    .subarray([...VALID_CATEGORIES], { minLength: 0, maxLength: VALID_CATEGORIES.length })
    .map((arr) => [...new Set(arr)]);
// ── Property 13: Filter State Session Round-Trip ──
describe('Feature: recipe-library, Property 13: Filter State Session Round-Trip', () => {
    /**
     * **Validates: Requirements 7.4, 7.5**
     *
     * For any set of selected category filters, persisting them to session
     * storage and then reading them back should produce an identical set.
     */
    it('round-trips any category selection through session storage', () => {
        fc.assert(fc.property(arbCategorySubset, (categories) => {
            const storage = createMockStorage();
            // Build a FilterState with the given categories
            const state = {
                selectedCategories: new Set(categories),
            };
            // Persist and restore
            saveFilterState(storage, state);
            const restored = loadFilterState(storage);
            // The restored set must be identical
            const originalSorted = getSelectedCategories(state).sort();
            const restoredSorted = getSelectedCategories(restored).sort();
            expect(restoredSorted).toEqual(originalSorted);
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=filter.property.test.js.map
/**
 * Filter & Search UI state management.
 *
 * Pure TypeScript modules for FilterBar, SearchInput,
 * filter state persistence, and zero-results view model.
 */
// ── Valid Categories ──
export const VALID_CATEGORIES = [
    'Roster Ops',
    'Course Lifecycle',
    'Notifications',
    'Analytics',
    'Assessment',
];
const STORAGE_KEY = 'recipe-library:filters';
export function createFilterState() {
    return { selectedCategories: new Set() };
}
export function toggleCategory(state, category) {
    const next = new Set(state.selectedCategories);
    if (next.has(category)) {
        next.delete(category);
    }
    else {
        next.add(category);
    }
    return { selectedCategories: next };
}
export function clearFilters() {
    return { selectedCategories: new Set() };
}
export function getSelectedCategories(state) {
    return [...state.selectedCategories];
}
export function createSearchState() {
    return { query: '' };
}
export function setQuery(state, query) {
    return { query };
}
export function clearQuery() {
    return { query: '' };
}
export function getQuery(state) {
    return state.query;
}
/**
 * Creates a debounced version of a callback.
 * Returns a function that delays invoking `fn` until `delayMs`
 * milliseconds have elapsed since the last invocation.
 */
export function debounce(fn, delayMs) {
    let timer = null;
    return (...args) => {
        if (timer !== null)
            clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delayMs);
    };
}
// ── Filter State Persistence ──
export function saveFilterState(storage, state) {
    const categories = getSelectedCategories(state);
    storage.setItem(STORAGE_KEY, JSON.stringify(categories));
}
export function loadFilterState(storage) {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null)
        return createFilterState();
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return createFilterState();
        const validSet = new Set(VALID_CATEGORIES);
        const categories = parsed.filter((item) => typeof item === 'string' && validSet.has(item));
        return { selectedCategories: new Set(categories) };
    }
    catch {
        return createFilterState();
    }
}
export function buildZeroResultsViewModel(suggestions) {
    return {
        message: 'No templates found matching your criteria.',
        suggestions,
        hasSuggestions: suggestions.length > 0,
    };
}
//# sourceMappingURL=filter.js.map
/**
 * Filter & Search UI state management.
 *
 * Pure TypeScript modules for FilterBar, SearchInput,
 * filter state persistence, and zero-results view model.
 */
export declare const VALID_CATEGORIES: readonly ["Roster Ops", "Course Lifecycle", "Notifications", "Analytics", "Assessment"];
export type Category = (typeof VALID_CATEGORIES)[number];
export interface Storage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
export interface FilterState {
    selectedCategories: Set<Category>;
}
export declare function createFilterState(): FilterState;
export declare function toggleCategory(state: FilterState, category: Category): FilterState;
export declare function clearFilters(): FilterState;
export declare function getSelectedCategories(state: FilterState): Category[];
export interface SearchState {
    query: string;
}
export declare function createSearchState(): SearchState;
export declare function setQuery(state: SearchState, query: string): SearchState;
export declare function clearQuery(): SearchState;
export declare function getQuery(state: SearchState): string;
/**
 * Creates a debounced version of a callback.
 * Returns a function that delays invoking `fn` until `delayMs`
 * milliseconds have elapsed since the last invocation.
 */
export declare function debounce<T extends (...args: unknown[]) => void>(fn: T, delayMs: number): (...args: Parameters<T>) => void;
export declare function saveFilterState(storage: Storage, state: FilterState): void;
export declare function loadFilterState(storage: Storage): FilterState;
export interface ZeroResultsViewModel {
    message: string;
    suggestions: string[];
    hasSuggestions: boolean;
}
export declare function buildZeroResultsViewModel(suggestions: string[]): ZeroResultsViewModel;
//# sourceMappingURL=filter.d.ts.map
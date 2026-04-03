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
] as const;

export type Category = (typeof VALID_CATEGORIES)[number];

// ── Storage Interface ──

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// ── FilterBar State ──

export interface FilterState {
  selectedCategories: Set<Category>;
}

const STORAGE_KEY = 'recipe-library:filters';

export function createFilterState(): FilterState {
  return { selectedCategories: new Set() };
}

export function toggleCategory(state: FilterState, category: Category): FilterState {
  const next = new Set(state.selectedCategories);
  if (next.has(category)) {
    next.delete(category);
  } else {
    next.add(category);
  }
  return { selectedCategories: next };
}

export function clearFilters(): FilterState {
  return { selectedCategories: new Set() };
}

export function getSelectedCategories(state: FilterState): Category[] {
  return [...state.selectedCategories];
}

// ── SearchInput State ──

export interface SearchState {
  query: string;
}

export function createSearchState(): SearchState {
  return { query: '' };
}

export function setQuery(state: SearchState, query: string): SearchState {
  return { query };
}

export function clearQuery(): SearchState {
  return { query: '' };
}

export function getQuery(state: SearchState): string {
  return state.query;
}

/**
 * Creates a debounced version of a callback.
 * Returns a function that delays invoking `fn` until `delayMs`
 * milliseconds have elapsed since the last invocation.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

// ── Filter State Persistence ──

export function saveFilterState(storage: Storage, state: FilterState): void {
  const categories = getSelectedCategories(state);
  storage.setItem(STORAGE_KEY, JSON.stringify(categories));
}

export function loadFilterState(storage: Storage): FilterState {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return createFilterState();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return createFilterState();

    const validSet = new Set<string>(VALID_CATEGORIES);
    const categories = parsed.filter(
      (item): item is Category => typeof item === 'string' && validSet.has(item),
    );
    return { selectedCategories: new Set(categories) };
  } catch {
    return createFilterState();
  }
}

// ── Zero-Results View Model ──

export interface ZeroResultsViewModel {
  message: string;
  suggestions: string[];
  hasSuggestions: boolean;
}

export function buildZeroResultsViewModel(
  suggestions: string[],
): ZeroResultsViewModel {
  return {
    message: 'No templates found matching your criteria.',
    suggestions,
    hasSuggestions: suggestions.length > 0,
  };
}

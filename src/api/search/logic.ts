/**
 * Pure logic functions for the Search API.
 *
 * These are intentionally decoupled from OpenSearch so they can be
 * property-tested with arbitrary inputs.
 */

import type { Template } from '../../models/types';

// ── Valid categories for suggestions ──

const VALID_CATEGORIES = [
  'Roster Ops',
  'Course Lifecycle',
  'Notifications',
  'Analytics',
  'Assessment',
];

// ── Response Shapes ──

export interface SearchResult {
  templateId: string;
  name: string;
  description: string;
  categories: string[];
  connectedSystems: string[];
  timeToActivate: string;
  educationStandardTags: string[];
}

export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  suggestions: string[];
}

// ── Template → SearchResult ──

export function toSearchResult(template: Template): SearchResult {
  return {
    templateId: template.templateId,
    name: template.name,
    description: template.description,
    categories: template.categories,
    connectedSystems: template.connectedSystems,
    timeToActivate: template.timeToActivate,
    educationStandardTags: template.educationStandardTags,
  };
}

// ── Core Search + Filter Logic (Property 14) ──

/**
 * Searches templates by query text and filters by categories.
 *
 * - Empty query means no search restriction (all templates match).
 * - Empty categories means no category restriction (all categories match).
 * - When both are provided, returns the intersection.
 *
 * Search is case-insensitive substring match on name and description.
 */
export function searchTemplates(
  templates: Template[],
  query: string,
  categories: string[],
): Template[] {
  const normalizedQuery = query.trim().toLowerCase();
  const categorySet = new Set(categories);

  return templates.filter((t) => {
    // Search restriction: empty query matches everything
    const matchesQuery =
      normalizedQuery === '' ||
      t.name.toLowerCase().includes(normalizedQuery) ||
      t.description.toLowerCase().includes(normalizedQuery);

    // Category restriction: empty categories matches everything
    const matchesCategory =
      categorySet.size === 0 ||
      t.categories.some((c) => categorySet.has(c));

    return matchesQuery && matchesCategory;
  });
}

// ── Zero-Results Suggestion Logic ──

/**
 * Generates suggestions when a search returns zero results.
 *
 * Strategy:
 * 1. If the query has multiple words, suggest individual words as alternative searches.
 * 2. Suggest categories that have templates available (from the full catalog).
 * 3. If the query is a single word, suggest substrings (prefix trimming) as alternatives.
 */
export function generateSuggestions(
  query: string,
  allTemplates: Template[],
  selectedCategories: string[],
): string[] {
  const suggestions: string[] = [];
  const normalizedQuery = query.trim().toLowerCase();

  // Strategy 1: Split multi-word queries into individual word suggestions
  if (normalizedQuery !== '') {
    const words = normalizedQuery.split(/\s+/).filter((w) => w.length >= 2);
    if (words.length > 1) {
      for (const word of words) {
        // Only suggest a word if it would actually return results
        const wouldMatch = allTemplates.some(
          (t) =>
            t.name.toLowerCase().includes(word) ||
            t.description.toLowerCase().includes(word),
        );
        if (wouldMatch) {
          suggestions.push(word);
        }
      }
    }
  }

  // Strategy 2: Suggest available categories (those with templates)
  const availableCategories = new Set<string>();
  for (const t of allTemplates) {
    for (const c of t.categories) {
      availableCategories.add(c);
    }
  }

  const selectedSet = new Set(selectedCategories);
  for (const cat of VALID_CATEGORIES) {
    if (availableCategories.has(cat) && !selectedSet.has(cat)) {
      suggestions.push(cat);
    }
  }

  return suggestions;
}

// ── Build Search Response ──

/**
 * Builds the complete search response, including suggestions when zero results.
 */
export function buildSearchResponse(
  allTemplates: Template[],
  query: string,
  categories: string[],
): SearchResponse {
  const matched = searchTemplates(allTemplates, query, categories);
  const results = matched.map(toSearchResult);

  const suggestions =
    results.length === 0
      ? generateSuggestions(query, allTemplates, categories)
      : [];

  return {
    results,
    totalCount: results.length,
    suggestions,
  };
}

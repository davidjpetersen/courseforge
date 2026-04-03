/**
 * Pure logic functions for the Search API.
 *
 * These are intentionally decoupled from OpenSearch so they can be
 * property-tested with arbitrary inputs.
 */
import type { Template } from '../../models/types.js';
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
export declare function toSearchResult(template: Template): SearchResult;
/**
 * Searches templates by query text and filters by categories.
 *
 * - Empty query means no search restriction (all templates match).
 * - Empty categories means no category restriction (all categories match).
 * - When both are provided, returns the intersection.
 *
 * Search is case-insensitive substring match on name and description.
 */
export declare function searchTemplates(templates: Template[], query: string, categories: string[]): Template[];
/**
 * Generates suggestions when a search returns zero results.
 *
 * Strategy:
 * 1. If the query has multiple words, suggest individual words as alternative searches.
 * 2. Suggest categories that have templates available (from the full catalog).
 * 3. If the query is a single word, suggest substrings (prefix trimming) as alternatives.
 */
export declare function generateSuggestions(query: string, allTemplates: Template[], selectedCategories: string[]): string[];
/**
 * Builds the complete search response, including suggestions when zero results.
 */
export declare function buildSearchResponse(allTemplates: Template[], query: string, categories: string[]): SearchResponse;
//# sourceMappingURL=logic.d.ts.map
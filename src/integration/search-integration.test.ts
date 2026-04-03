/**
 * Integration Test — Search integration.
 *
 * Exercises the search pipeline using seed templates:
 *   index templates → search by keyword → filter by category → zero results → clear search
 *
 * Uses the pure logic functions (no OpenSearch dependency).
 */

import { describe, it, expect } from 'vitest';
import { SEED_TEMPLATES } from '../data/seed-templates.js';
import { buildSearchResponse, searchTemplates } from '../api/search/logic.js';

describe('Search integration', () => {
  const templates = SEED_TEMPLATES;

  it('search by keyword returns correct results', () => {
    // "Roster" should match the Roster Ops template
    const response = buildSearchResponse(templates, 'Roster', []);
    expect(response.totalCount).toBeGreaterThanOrEqual(1);
    expect(response.results.some((r) => r.name.includes('Roster'))).toBe(true);
    expect(response.suggestions).toEqual([]);
  });

  it('search by keyword in description returns correct results', () => {
    // "notifications" appears in the Notifications template name/description
    const response = buildSearchResponse(templates, 'notifications', []);
    expect(response.totalCount).toBeGreaterThanOrEqual(1);
    expect(
      response.results.some((r) =>
        r.name.toLowerCase().includes('notification') ||
        r.description.toLowerCase().includes('notification'),
      ),
    ).toBe(true);
  });

  it('search with category filter returns intersection', () => {
    // Search for "sync" within "Roster Ops" category
    const response = buildSearchResponse(templates, 'sync', ['Roster Ops']);
    // Only templates matching BOTH "sync" text AND "Roster Ops" category
    for (const result of response.results) {
      expect(result.categories).toContain('Roster Ops');
      const matchesQuery =
        result.name.toLowerCase().includes('sync') ||
        result.description.toLowerCase().includes('sync');
      expect(matchesQuery).toBe(true);
    }
  });

  it('search with category filter excludes non-matching categories', () => {
    // Search for "course" within "Notifications" category — should not match Course Lifecycle template
    const response = buildSearchResponse(templates, 'course', ['Notifications']);
    for (const result of response.results) {
      expect(result.categories).toContain('Notifications');
    }
  });

  it('search with no results returns suggestions', () => {
    const response = buildSearchResponse(templates, 'xyznonexistent', []);
    expect(response.totalCount).toBe(0);
    expect(response.results).toEqual([]);
    expect(response.suggestions.length).toBeGreaterThan(0);
  });

  it('clear search (empty query, no filters) returns all templates', () => {
    const response = buildSearchResponse(templates, '', []);
    expect(response.totalCount).toBe(templates.length);
    expect(response.results).toHaveLength(templates.length);
    expect(response.suggestions).toEqual([]);
  });

  it('empty query with category filter returns only that category', () => {
    const response = buildSearchResponse(templates, '', ['Course Lifecycle']);
    for (const result of response.results) {
      expect(result.categories).toContain('Course Lifecycle');
    }
    expect(response.totalCount).toBeGreaterThanOrEqual(1);
  });

  it('searchTemplates returns correct subset for keyword + category', () => {
    const matched = searchTemplates(templates, 'LMS', ['Notifications']);
    for (const t of matched) {
      expect(t.categories).toContain('Notifications');
      const matchesQuery =
        t.name.toLowerCase().includes('lms') ||
        t.description.toLowerCase().includes('lms');
      expect(matchesQuery).toBe(true);
    }
  });
});

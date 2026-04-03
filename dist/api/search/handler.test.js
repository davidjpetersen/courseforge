import { describe, it, expect } from 'vitest';
import { createSearchHandler, } from './handler.js';
import { searchTemplates, generateSuggestions, buildSearchResponse, } from './logic.js';
import { ROSTER_OPS_TEMPLATE, NOTIFICATIONS_TEMPLATE, SEED_TEMPLATES, } from '../../data/seed-templates.js';
// ── Helpers ──
function makeClient(templates) {
    return {
        search: async (query, categories) => searchTemplates(templates, query, categories),
        listAll: async () => templates,
    };
}
function makeEvent(overrides = {}) {
    return {
        httpMethod: 'GET',
        path: '/search',
        pathParameters: null,
        queryStringParameters: null,
        headers: null,
        ...overrides,
    };
}
// ── searchTemplates unit tests ──
describe('searchTemplates', () => {
    it('returns all templates when query and categories are empty', () => {
        const result = searchTemplates(SEED_TEMPLATES, '', []);
        expect(result).toHaveLength(3);
    });
    it('returns empty array when no templates exist', () => {
        const result = searchTemplates([], 'roster', []);
        expect(result).toHaveLength(0);
    });
    it('matches by name (case-insensitive)', () => {
        const result = searchTemplates(SEED_TEMPLATES, 'ROSTER', []);
        expect(result).toHaveLength(1);
        expect(result[0].templateId).toBe(ROSTER_OPS_TEMPLATE.templateId);
    });
    it('matches by description (case-insensitive)', () => {
        const result = searchTemplates(SEED_TEMPLATES, 'notifications', []);
        expect(result).toHaveLength(1);
        expect(result[0].templateId).toBe(NOTIFICATIONS_TEMPLATE.templateId);
    });
    it('returns empty for query that matches nothing', () => {
        const result = searchTemplates(SEED_TEMPLATES, 'zzzznonexistent', []);
        expect(result).toHaveLength(0);
    });
    it('handles special characters in query without crashing', () => {
        const result = searchTemplates(SEED_TEMPLATES, '!@#$%^&*()', []);
        expect(result).toHaveLength(0);
    });
    it('handles whitespace-only query as empty (returns all)', () => {
        const result = searchTemplates(SEED_TEMPLATES, '   ', []);
        expect(result).toHaveLength(3);
    });
    it('filters by category only when query is empty', () => {
        const result = searchTemplates(SEED_TEMPLATES, '', ['Roster Ops']);
        expect(result).toHaveLength(1);
        expect(result[0].templateId).toBe(ROSTER_OPS_TEMPLATE.templateId);
    });
    it('returns intersection of query and category filter', () => {
        // "course" matches Course Lifecycle by name, but filter to Notifications → empty
        const result = searchTemplates(SEED_TEMPLATES, 'course', ['Notifications']);
        // "course" doesn't appear in Notifications template name/description... let's check
        // Actually "Course Enrollment" is in Notifications description, so it might match
        // Let's use a more specific query
        const result2 = searchTemplates(SEED_TEMPLATES, 'roster', ['Notifications']);
        expect(result2).toHaveLength(0);
    });
});
// ── generateSuggestions unit tests ──
describe('generateSuggestions', () => {
    it('suggests individual words from multi-word query if they match', () => {
        const suggestions = generateSuggestions('roster sync magic', SEED_TEMPLATES, []);
        // "roster" and "sync" appear in seed templates, "magic" does not
        expect(suggestions).toContain('roster');
        expect(suggestions).toContain('sync');
        expect(suggestions).not.toContain('magic');
    });
    it('suggests available categories not already selected', () => {
        const suggestions = generateSuggestions('zzzznothing', SEED_TEMPLATES, ['Roster Ops']);
        // Should suggest categories that have templates but are not selected
        expect(suggestions).toContain('Course Lifecycle');
        expect(suggestions).toContain('Notifications');
        expect(suggestions).not.toContain('Roster Ops'); // already selected
    });
    it('returns empty suggestions for empty query with no templates', () => {
        const suggestions = generateSuggestions('', [], []);
        expect(suggestions).toHaveLength(0);
    });
    it('does not suggest single-character words', () => {
        const suggestions = generateSuggestions('a b roster', SEED_TEMPLATES, []);
        expect(suggestions).not.toContain('a');
        expect(suggestions).not.toContain('b');
    });
});
// ── buildSearchResponse unit tests ──
describe('buildSearchResponse', () => {
    it('returns results with correct totalCount', () => {
        const response = buildSearchResponse(SEED_TEMPLATES, 'roster', []);
        expect(response.totalCount).toBe(1);
        expect(response.results).toHaveLength(1);
        expect(response.suggestions).toHaveLength(0);
    });
    it('returns suggestions when zero results', () => {
        const response = buildSearchResponse(SEED_TEMPLATES, 'zzzznothing', []);
        expect(response.totalCount).toBe(0);
        expect(response.results).toHaveLength(0);
        expect(response.suggestions.length).toBeGreaterThan(0);
    });
    it('returns all templates for empty query and empty categories', () => {
        const response = buildSearchResponse(SEED_TEMPLATES, '', []);
        expect(response.totalCount).toBe(3);
        expect(response.suggestions).toHaveLength(0);
    });
});
// ── Handler unit tests ──
describe('GET /search handler', () => {
    it('returns 200 with results for a matching query', async () => {
        const handler = createSearchHandler(makeClient(SEED_TEMPLATES));
        const result = await handler(makeEvent({ queryStringParameters: { q: 'roster' } }));
        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body.totalCount).toBe(1);
        expect(body.results[0].templateId).toBe(ROSTER_OPS_TEMPLATE.templateId);
    });
    it('returns all templates when no query params provided', async () => {
        const handler = createSearchHandler(makeClient(SEED_TEMPLATES));
        const result = await handler(makeEvent());
        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body.totalCount).toBe(3);
    });
    it('returns zero results with suggestions for non-matching query', async () => {
        const handler = createSearchHandler(makeClient(SEED_TEMPLATES));
        const result = await handler(makeEvent({ queryStringParameters: { q: 'zzzznothing' } }));
        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body.totalCount).toBe(0);
        expect(body.suggestions.length).toBeGreaterThan(0);
    });
    it('supports combined query and category filter', async () => {
        const handler = createSearchHandler(makeClient(SEED_TEMPLATES));
        const result = await handler(makeEvent({
            queryStringParameters: { q: 'sync', category: 'Roster Ops' },
        }));
        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body.totalCount).toBe(1);
    });
    it('returns 503 when search client throws', async () => {
        const failingClient = {
            search: async () => { throw new Error('OpenSearch down'); },
            listAll: async () => { throw new Error('OpenSearch down'); },
        };
        const handler = createSearchHandler(failingClient);
        const result = await handler(makeEvent());
        expect(result.statusCode).toBe(503);
        const body = JSON.parse(result.body);
        expect(body.message).toContain('temporarily unavailable');
    });
    it('handles empty query string parameter', async () => {
        const handler = createSearchHandler(makeClient(SEED_TEMPLATES));
        const result = await handler(makeEvent({ queryStringParameters: { q: '' } }));
        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body.totalCount).toBe(3);
    });
    it('handles special characters in query', async () => {
        const handler = createSearchHandler(makeClient(SEED_TEMPLATES));
        const result = await handler(makeEvent({ queryStringParameters: { q: '<script>alert("xss")</script>' } }));
        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body.totalCount).toBe(0);
    });
});
//# sourceMappingURL=handler.test.js.map
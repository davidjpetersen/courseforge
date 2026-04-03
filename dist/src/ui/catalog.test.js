import { describe, it, expect } from 'vitest';
import { buildCardViewModel, buildDetailViewModel, buildCatalogViewModel, } from './catalog.js';
// ── Helpers ──
function makeTemplate(overrides = {}) {
    return {
        templateId: 'tpl-1',
        name: 'Roster Sync',
        description: 'Syncs roster data from SIS to LMS',
        categories: ['Roster Ops'],
        connectedSystems: ['Canvas LMS', 'PowerSchool SIS'],
        requiredParameters: [
            {
                fieldId: 'syncInterval',
                label: 'Sync Interval',
                type: 'select',
                required: true,
                helpText: 'How often to sync',
                validation: { options: ['hourly', 'daily'] },
                connectedSystem: null,
            },
        ],
        timeToActivate: '5 min',
        educationStandardTags: ['OneRoster', 'SIS'],
        steps: [
            {
                stepIndex: 0,
                title: 'Configure Sync',
                helpText: 'Set up sync parameters',
                fields: [],
            },
            {
                stepIndex: 1,
                title: 'Map Fields',
                helpText: 'Map SIS fields to LMS fields',
                fields: [],
            },
        ],
        certified: true,
        createdAt: '2024-01-01T00:00:00Z',
        ...overrides,
    };
}
// ── buildCardViewModel ──
describe('buildCardViewModel', () => {
    it('extracts all required card fields', () => {
        const template = makeTemplate();
        const card = buildCardViewModel(template);
        expect(card.name).toBe('Roster Sync');
        expect(card.description).toBe('Syncs roster data from SIS to LMS');
        expect(card.connectedSystems).toEqual(['Canvas LMS', 'PowerSchool SIS']);
        expect(card.timeToActivate).toBe('5 min');
        expect(card.educationStandardTags).toEqual(['OneRoster', 'SIS']);
    });
    it('handles template with empty connected systems and tags', () => {
        const template = makeTemplate({
            connectedSystems: [],
            educationStandardTags: [],
        });
        const card = buildCardViewModel(template);
        expect(card.connectedSystems).toEqual([]);
        expect(card.educationStandardTags).toEqual([]);
    });
});
// ── buildDetailViewModel ──
describe('buildDetailViewModel', () => {
    it('includes all card fields plus detail-specific fields', () => {
        const template = makeTemplate();
        const detail = buildDetailViewModel(template, ['Canvas LMS']);
        expect(detail.name).toBe('Roster Sync');
        expect(detail.description).toBe('Syncs roster data from SIS to LMS');
        expect(detail.connectedSystems).toEqual(['Canvas LMS', 'PowerSchool SIS']);
        expect(detail.timeToActivate).toBe('5 min');
        expect(detail.educationStandardTags).toEqual(['OneRoster', 'SIS']);
        expect(detail.requiredParameters).toHaveLength(1);
        expect(detail.stepCount).toBe(2);
        expect(detail.configureCTA).toBe(true);
    });
    it('detects missing connections', () => {
        const template = makeTemplate();
        const detail = buildDetailViewModel(template, ['Canvas LMS']);
        expect(detail.missingConnections).toEqual(['PowerSchool SIS']);
    });
    it('reports no missing connections when all are configured', () => {
        const template = makeTemplate();
        const detail = buildDetailViewModel(template, [
            'Canvas LMS',
            'PowerSchool SIS',
        ]);
        expect(detail.missingConnections).toEqual([]);
    });
    it('reports all connections missing when tenant has none', () => {
        const template = makeTemplate();
        const detail = buildDetailViewModel(template, []);
        expect(detail.missingConnections).toEqual([
            'Canvas LMS',
            'PowerSchool SIS',
        ]);
    });
    it('counts steps correctly', () => {
        const template = makeTemplate({ steps: [] });
        const detail = buildDetailViewModel(template, []);
        expect(detail.stepCount).toBe(0);
    });
});
// ── buildCatalogViewModel ──
describe('buildCatalogViewModel', () => {
    it('returns empty catalog for no templates', () => {
        const catalog = buildCatalogViewModel([]);
        expect(catalog.templates).toEqual([]);
        expect(catalog.groupedByCategory).toEqual({});
    });
    it('groups a single-category template under its category', () => {
        const template = makeTemplate({ categories: ['Roster Ops'] });
        const catalog = buildCatalogViewModel([template]);
        expect(Object.keys(catalog.groupedByCategory)).toEqual(['Roster Ops']);
        expect(catalog.groupedByCategory['Roster Ops']).toHaveLength(1);
    });
    it('places multi-category template under each category', () => {
        const template = makeTemplate({
            categories: ['Roster Ops', 'Notifications'],
        });
        const catalog = buildCatalogViewModel([template]);
        expect(catalog.groupedByCategory['Roster Ops']).toHaveLength(1);
        expect(catalog.groupedByCategory['Notifications']).toHaveLength(1);
        expect(catalog.groupedByCategory['Roster Ops'][0].templateId).toBe(catalog.groupedByCategory['Notifications'][0].templateId);
    });
    it('groups multiple templates correctly', () => {
        const t1 = makeTemplate({
            templateId: 'tpl-1',
            categories: ['Roster Ops'],
        });
        const t2 = makeTemplate({
            templateId: 'tpl-2',
            categories: ['Notifications'],
        });
        const t3 = makeTemplate({
            templateId: 'tpl-3',
            categories: ['Roster Ops', 'Notifications'],
        });
        const catalog = buildCatalogViewModel([t1, t2, t3]);
        expect(catalog.templates).toHaveLength(3);
        expect(catalog.groupedByCategory['Roster Ops']).toHaveLength(2);
        expect(catalog.groupedByCategory['Notifications']).toHaveLength(2);
    });
});
//# sourceMappingURL=catalog.test.js.map
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  buildCardViewModel,
  buildDetailViewModel,
  buildCatalogViewModel,
} from './catalog.js';
import { groupByCategory, toSummary } from '../api/templates/logic.js';
import type { Template } from '../models/types.js';

// ── Generators ──

const VALID_CATEGORIES = [
  'Roster Ops',
  'Course Lifecycle',
  'Notifications',
  'Analytics',
  'Assessment',
];

const arbCategories: fc.Arbitrary<string[]> = fc
  .subarray(VALID_CATEGORIES, { minLength: 1, maxLength: VALID_CATEGORIES.length })
  .map((arr) => [...new Set(arr)]);

const arbConnectionSet: fc.Arbitrary<string[]> = fc
  .array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 6 })
  .map((arr) => [...new Set(arr)]);

const arbTagSet: fc.Arbitrary<string[]> = fc
  .subarray(['OneRoster', 'LTI', 'SIS', 'xAPI', 'SCORM'], {
    minLength: 0,
    maxLength: 5,
  })
  .map((arr) => [...new Set(arr)]);

function arbTemplate(): fc.Arbitrary<Template> {
  return fc
    .tuple(
      fc.uuid(),
      fc.string({ minLength: 1, maxLength: 40 }),
      fc.string({ minLength: 0, maxLength: 100 }),
      arbCategories,
      arbConnectionSet,
      fc.string({ minLength: 1, maxLength: 20 }),
      arbTagSet,
      fc.array(
        fc.record({
          fieldId: fc.uuid(),
          label: fc.string({ minLength: 1, maxLength: 30 }),
          type: fc.constantFrom('text', 'select', 'number', 'boolean', 'connection') as fc.Arbitrary<'text' | 'select' | 'number' | 'boolean' | 'connection'>,
          required: fc.boolean(),
          helpText: fc.string({ minLength: 0, maxLength: 50 }),
          validation: fc.constant({}),
          connectedSystem: fc.constant(null) as fc.Arbitrary<string | null>,
        }),
        { minLength: 0, maxLength: 4 },
      ),
      fc.array(
        fc.record({
          stepIndex: fc.nat({ max: 10 }),
          title: fc.string({ minLength: 1, maxLength: 30 }),
          helpText: fc.string({ minLength: 0, maxLength: 50 }),
          fields: fc.constant([]),
        }),
        { minLength: 0, maxLength: 5 },
      ),
    )
    .map(
      ([
        id,
        name,
        description,
        categories,
        connectedSystems,
        timeToActivate,
        tags,
        requiredParameters,
        steps,
      ]) => ({
        templateId: id,
        name,
        description,
        categories,
        connectedSystems,
        requiredParameters,
        timeToActivate,
        educationStandardTags: tags,
        steps,
        certified: true,
        createdAt: '2024-01-01T00:00:00Z',
      }),
    );
}

const arbTemplateList: fc.Arbitrary<Template[]> = fc.array(arbTemplate(), {
  minLength: 0,
  maxLength: 10,
});

// ── Property 2: Template Grouping by Category ──

describe('Feature: recipe-library, Property 2: Template Grouping by Category', () => {
  /**
   * **Validates: Requirements 1.1, 1.6**
   *
   * For any set of templates where each template has one or more categories,
   * grouping them by category should place each template under every category
   * it belongs to, and no template should appear under a category it does not
   * belong to.
   */
  it('places each template under every category it belongs to and no others', () => {
    fc.assert(
      fc.property(arbTemplateList, (templates) => {
        const catalog = buildCatalogViewModel(templates);
        const grouped = catalog.groupedByCategory;

        // Every template appears under each of its categories
        for (const summary of catalog.templates) {
          for (const cat of summary.categories) {
            const bucket = grouped[cat];
            expect(bucket).toBeDefined();
            expect(bucket!.some((s) => s.templateId === summary.templateId)).toBe(true);
          }
        }

        // No template appears under a category it doesn't belong to
        for (const [cat, summaries] of Object.entries(grouped)) {
          for (const summary of summaries) {
            expect(summary.categories).toContain(cat);
          }
        }

        // Total entries across all groups equals sum of category counts
        const totalGroupEntries = Object.values(grouped).reduce(
          (sum, arr) => sum + arr.length,
          0,
        );
        const expectedTotal = catalog.templates.reduce(
          (sum, s) => sum + s.categories.length,
          0,
        );
        expect(totalGroupEntries).toBe(expectedTotal);
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 3: Template View Renders Required Fields ──

describe('Feature: recipe-library, Property 3: Template View Renders Required Fields', () => {
  /**
   * **Validates: Requirements 1.3, 2.1**
   *
   * For any template and any view type (card or detail), the rendered output
   * should contain all fields required by that view type — card views must
   * include name, description, connected systems, time-to-activate, and
   * education standard tags; detail views must additionally include required
   * parameters and step count.
   */
  it('card view contains all required card fields', () => {
    fc.assert(
      fc.property(arbTemplate(), (template) => {
        const card = buildCardViewModel(template);

        expect(card.name).toBe(template.name);
        expect(card.description).toBe(template.description);
        expect(card.connectedSystems).toEqual(template.connectedSystems);
        expect(card.timeToActivate).toBe(template.timeToActivate);
        expect(card.educationStandardTags).toEqual(template.educationStandardTags);
      }),
      { numRuns: 100 },
    );
  });

  it('detail view contains all required detail fields', () => {
    fc.assert(
      fc.property(
        arbTemplate(),
        arbConnectionSet,
        (template, tenantConnections) => {
          const detail = buildDetailViewModel(template, tenantConnections);

          // All card fields present
          expect(detail.name).toBe(template.name);
          expect(detail.description).toBe(template.description);
          expect(detail.connectedSystems).toEqual(template.connectedSystems);
          expect(detail.timeToActivate).toBe(template.timeToActivate);
          expect(detail.educationStandardTags).toEqual(template.educationStandardTags);

          // Detail-specific fields present
          expect(detail.requiredParameters).toEqual(template.requiredParameters);
          expect(detail.stepCount).toBe(template.steps.length);

          // configureCTA is always present
          expect(typeof detail.configureCTA).toBe('boolean');

          // missingConnections is always an array
          expect(Array.isArray(detail.missingConnections)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

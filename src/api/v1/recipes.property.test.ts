import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import type { Template } from '../../models/types.js';
import {
  createV1RecipeHandler,
  templateToRecipe,
  type RecipeRepository,
} from './recipes.js';

// ── Arbitraries ──

const arbFieldDefinition = fc.record({
  fieldId: fc.string({ minLength: 1 }),
  label: fc.string({ minLength: 1 }),
  type: fc.constantFrom('text', 'select', 'number', 'boolean', 'connection') as fc.Arbitrary<'text' | 'select' | 'number' | 'boolean' | 'connection'>,
  required: fc.boolean(),
  helpText: fc.string(),
  validation: fc.record({
    pattern: fc.option(fc.string(), { nil: undefined }),
    min: fc.option(fc.integer(), { nil: undefined }),
    max: fc.option(fc.integer(), { nil: undefined }),
    options: fc.option(fc.array(fc.string()), { nil: undefined }),
  }),
  connectedSystem: fc.option(fc.string({ minLength: 1 }), { nil: null }),
});

const arbStepDefinition = fc.record({
  stepIndex: fc.nat(),
  title: fc.string({ minLength: 1 }),
  helpText: fc.string(),
  fields: fc.array(arbFieldDefinition, { maxLength: 3 }),
});

const arbTimeToActivate = fc.constantFrom(
  '15 minutes', '30 minutes', '45 minutes',
  '1 hour', '2 hours', '90', '10',
);

const arbTemplate: fc.Arbitrary<Template> = fc.record({
  templateId: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  description: fc.string({ maxLength: 500 }),
  categories: fc.array(fc.string({ minLength: 1 }), { minLength: 0, maxLength: 5 }),
  connectedSystems: fc.array(fc.string({ minLength: 1 }), { maxLength: 3 }),
  requiredParameters: fc.array(arbFieldDefinition, { maxLength: 3 }),
  timeToActivate: arbTimeToActivate,
  educationStandardTags: fc.array(fc.string({ minLength: 1 }), { maxLength: 5 }),
  steps: fc.array(arbStepDefinition, { maxLength: 3 }),
  certified: fc.boolean(),
  createdAt: fc.date().map((d) => d.toISOString()),
});

function makeRepo(templates: Template[]): RecipeRepository {
  return { listAll: async () => templates };
}

// ── Property 16: Recipe listing returns complete objects ──

describe('Feature: developer-rest-api, Property 16: Recipe listing returns complete objects', () => {
  /**
   * Validates: Requirements 6.1, 6.2
   *
   * For any set of template records, the recipe listing endpoint SHALL return
   * objects containing `id`, `name`, `description`, `category`, `standards`,
   * and `estimatedMinutes` fields.
   */

  it('templateToRecipe always produces objects with all required fields', () => {
    fc.assert(
      fc.property(arbTemplate, (template) => {
        const recipe = templateToRecipe(template);

        expect(recipe).toHaveProperty('id');
        expect(recipe).toHaveProperty('name');
        expect(recipe).toHaveProperty('description');
        expect(recipe).toHaveProperty('category');
        expect(recipe).toHaveProperty('standards');
        expect(recipe).toHaveProperty('estimatedMinutes');

        expect(typeof recipe.id).toBe('string');
        expect(typeof recipe.name).toBe('string');
        expect(typeof recipe.description).toBe('string');
        expect(typeof recipe.category).toBe('string');
        expect(Array.isArray(recipe.standards)).toBe(true);
        expect(typeof recipe.estimatedMinutes).toBe('number');
      }),
      { numRuns: 100 },
    );
  });

  it('handler list endpoint returns objects with all required fields for any templates', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(arbTemplate, { minLength: 0, maxLength: 10 }),
        async (templates) => {
          const handler = createV1RecipeHandler(makeRepo(templates));
          const result = await handler.list({ httpMethod: 'GET', path: '/api/v1/recipes' });

          expect(result.statusCode).toBe(200);

          const recipes = JSON.parse(result.body);
          expect(recipes).toHaveLength(templates.length);

          for (const recipe of recipes) {
            expect(recipe).toHaveProperty('id');
            expect(recipe).toHaveProperty('name');
            expect(recipe).toHaveProperty('description');
            expect(recipe).toHaveProperty('category');
            expect(recipe).toHaveProperty('standards');
            expect(recipe).toHaveProperty('estimatedMinutes');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('recipe id maps from templateId and standards maps from educationStandardTags', () => {
    fc.assert(
      fc.property(arbTemplate, (template) => {
        const recipe = templateToRecipe(template);

        expect(recipe.id).toBe(template.templateId);
        expect(recipe.standards).toEqual(template.educationStandardTags);
      }),
      { numRuns: 100 },
    );
  });
});

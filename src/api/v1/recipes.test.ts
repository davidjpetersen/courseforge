import { describe, it, expect } from 'vitest';
import type { Template } from '../../models/types';
import {
  createV1RecipeHandler,
  parseTimeToMinutes,
  templateToRecipe,
  type RecipeRepository,
  type APIGatewayProxyEvent,
} from './recipes';

// ── Helpers ──

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    templateId: 'tpl-1',
    name: 'Test Template',
    description: 'A test template',
    categories: ['SIS'],
    connectedSystems: [],
    requiredParameters: [],
    timeToActivate: '30 minutes',
    educationStandardTags: ['CEDS', 'Ed-Fi'],
    steps: [],
    certified: true,
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function dummyEvent(): APIGatewayProxyEvent {
  return { httpMethod: 'GET', path: '/api/v1/recipes' };
}

function makeRepo(templates: Template[]): RecipeRepository {
  return { listAll: async () => templates };
}

// ── parseTimeToMinutes ──

describe('parseTimeToMinutes', () => {
  it('parses "30 minutes"', () => {
    expect(parseTimeToMinutes('30 minutes')).toBe(30);
  });

  it('parses "1 hour"', () => {
    expect(parseTimeToMinutes('1 hour')).toBe(60);
  });

  it('parses "2 hours"', () => {
    expect(parseTimeToMinutes('2 hours')).toBe(120);
  });

  it('parses bare number as minutes', () => {
    expect(parseTimeToMinutes('45')).toBe(45);
  });

  it('returns default for empty string', () => {
    expect(parseTimeToMinutes('')).toBe(15);
  });

  it('returns default for non-numeric string', () => {
    expect(parseTimeToMinutes('quick')).toBe(15);
  });
});

// ── templateToRecipe ──

describe('templateToRecipe', () => {
  it('maps all fields correctly', () => {
    const template = makeTemplate();
    const recipe = templateToRecipe(template);

    expect(recipe).toEqual({
      id: 'tpl-1',
      name: 'Test Template',
      description: 'A test template',
      category: 'SIS',
      standards: ['CEDS', 'Ed-Fi'],
      estimatedMinutes: 30,
    });
  });

  it('uses first category when multiple exist', () => {
    const template = makeTemplate({ categories: ['LMS', 'SIS', 'Rostering'] });
    expect(templateToRecipe(template).category).toBe('LMS');
  });

  it('uses empty string when categories is empty', () => {
    const template = makeTemplate({ categories: [] });
    expect(templateToRecipe(template).category).toBe('');
  });
});

// ── createV1RecipeHandler ──

describe('createV1RecipeHandler', () => {
  it('returns 200 with recipe list', async () => {
    const templates = [makeTemplate(), makeTemplate({ templateId: 'tpl-2', name: 'Second' })];
    const handler = createV1RecipeHandler(makeRepo(templates));

    const result = await handler.list(dummyEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe('tpl-1');
    expect(body[1].id).toBe('tpl-2');
  });

  it('returns empty array when no templates exist', async () => {
    const handler = createV1RecipeHandler(makeRepo([]));
    const result = await handler.list(dummyEvent());

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });

  it('returns 500 on repository error', async () => {
    const repo: RecipeRepository = {
      listAll: async () => { throw new Error('DB down'); },
    };
    const handler = createV1RecipeHandler(repo);
    const result = await handler.list(dummyEvent());

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'Internal server error' });
  });

  it('each recipe has all required fields', async () => {
    const handler = createV1RecipeHandler(makeRepo([makeTemplate()]));
    const result = await handler.list(dummyEvent());
    const [recipe] = JSON.parse(result.body);

    expect(recipe).toHaveProperty('id');
    expect(recipe).toHaveProperty('name');
    expect(recipe).toHaveProperty('description');
    expect(recipe).toHaveProperty('category');
    expect(recipe).toHaveProperty('standards');
    expect(recipe).toHaveProperty('estimatedMinutes');
  });

  it('sets Content-Type to application/json', async () => {
    const handler = createV1RecipeHandler(makeRepo([]));
    const result = await handler.list(dummyEvent());
    expect(result.headers?.['Content-Type']).toBe('application/json');
  });
});

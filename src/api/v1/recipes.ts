/**
 * V1 Recipe listing handler.
 *
 * GET /api/v1/recipes — returns the catalog of available workflow recipes.
 * Thin adapter that maps internal Template records to the public Recipe shape.
 */

import type { Template } from '../../models/types.js';

// ── Minimal API Gateway types (matching existing pattern) ──

export interface APIGatewayProxyEvent {
  httpMethod: string;
  path: string;
  pathParameters?: Record<string, string> | null;
  queryStringParameters?: Record<string, string> | null;
  headers?: Record<string, string> | null;
}

export interface APIGatewayProxyResult {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

// ── Repository interface (subset of TemplateRepository) ──

export interface RecipeRepository {
  listAll(): Promise<Template[]>;
}

// ── Recipe shape (public API contract) ──

export interface Recipe {
  id: string;
  name: string;
  description: string;
  category: string;
  standards: string[];
  estimatedMinutes: number;
}

// ── Helpers ──

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

const DEFAULT_ESTIMATED_MINUTES = 15;

/**
 * Parse a human-readable time string (e.g. "30 minutes", "1 hour") into minutes.
 * Returns a default if the string cannot be parsed.
 */
export function parseTimeToMinutes(timeToActivate: string): number {
  const trimmed = timeToActivate.trim().toLowerCase();
  const match = trimmed.match(/^(\d+)\s*/);
  if (!match) return DEFAULT_ESTIMATED_MINUTES;

  const value = parseInt(match[1], 10);
  if (isNaN(value) || value <= 0) return DEFAULT_ESTIMATED_MINUTES;

  if (trimmed.includes('hour')) return value * 60;
  if (trimmed.includes('min')) return value;

  // Bare number — assume minutes
  return value;
}

/**
 * Map a Template to the public Recipe shape.
 */
export function templateToRecipe(template: Template): Recipe {
  return {
    id: template.templateId,
    name: template.name,
    description: template.description,
    category: template.categories[0] ?? '',
    standards: template.educationStandardTags,
    estimatedMinutes: parseTimeToMinutes(template.timeToActivate),
  };
}

// ── Handler factory ──

export function createV1RecipeHandler(repo: RecipeRepository) {
  return {
    async list(
      _event: APIGatewayProxyEvent,
    ): Promise<APIGatewayProxyResult> {
      try {
        const templates = await repo.listAll();
        const recipes = templates.map(templateToRecipe);
        return jsonResponse(200, recipes);
      } catch (error) {
        console.error('Error listing recipes:', error);
        return jsonResponse(500, { error: 'Internal server error' });
      }
    },
  };
}

/**
 * Lambda handler for the Search API.
 *
 * GET /search?q={query}&category={cat1,cat2}  — Full-text search with optional category filter
 *
 * The OpenSearch client is abstracted behind an interface so the handler
 * can be tested with in-memory implementations.
 */

import type { Template } from '../../models/types.js';
import { buildSearchResponse, type SearchResponse } from './logic.js';

// ── Minimal API Gateway types ──

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

// ── Search client interface (abstracts OpenSearch) ──

export interface SearchClient {
  /**
   * Search templates by query text with optional category filter.
   * Returns matching templates.
   *
   * For production: queries OpenSearch Serverless.
   * For testing: can use in-memory implementation.
   */
  search(query: string, categories: string[]): Promise<Template[]>;

  /**
   * Returns all templates (used for suggestion generation when zero results).
   */
  listAll(): Promise<Template[]>;
}

// ── Response helpers ──

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

// ── GET /search ──

export function createSearchHandler(client: SearchClient) {
  return async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    try {
      const query = event.queryStringParameters?.q ?? '';
      const categoryParam = event.queryStringParameters?.category ?? '';
      const categories = categoryParam
        ? categoryParam.split(',').map((c) => c.trim()).filter(Boolean)
        : [];

      const allTemplates = await client.listAll();
      const response: SearchResponse = buildSearchResponse(
        allTemplates,
        query,
        categories,
      );

      return jsonResponse(200, response);
    } catch (error) {
      console.error('Error searching templates:', error);
      return jsonResponse(503, {
        message: 'Search service temporarily unavailable',
      });
    }
  };
}

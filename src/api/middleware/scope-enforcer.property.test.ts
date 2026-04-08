import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { enforceScopeForRequest } from './scope-enforcer.js';

// ── Arbitraries ──

const arbScope = fc.constantFrom<'read' | 'write'>('read', 'write');
const arbMutationMethod = fc.constantFrom('POST', 'PUT', 'DELETE');
const arbGetMethod = fc.constantFrom('GET', 'get', 'Get');
const arbPath = fc.constantFrom(
  '/api/v1/workflows',
  '/api/v1/workflows/abc-123',
  '/api/v1/runs',
  '/api/v1/runs/run-1',
  '/api/v1/events',
  '/api/v1/recipes',
);

// ── Property 10: Scope enforcement ──

describe('Feature: developer-rest-api, Property 10: Scope enforcement', () => {
  /**
   * Validates: Requirements 14.1, 14.2, 14.3
   *
   * For any HTTP request:
   * - If scope is 'read' and method is POST/PUT/DELETE → returns 403 with { "error": "Insufficient scope" }
   * - If method is GET → returns null regardless of scope
   * - If scope is 'write' → returns null regardless of method
   */

  it('read scope + mutation method returns 403 with "Insufficient scope"', () => {
    fc.assert(
      fc.property(arbMutationMethod, arbPath, (method, path) => {
        const result = enforceScopeForRequest('read', method, path);

        expect(result).not.toBeNull();
        expect(result!.statusCode).toBe(403);
        expect(JSON.parse(result!.body)).toEqual({ error: 'Insufficient scope' });
      }),
      { numRuns: 100 },
    );
  });

  it('GET requests return null regardless of scope', () => {
    fc.assert(
      fc.property(arbScope, arbGetMethod, arbPath, (scope, method, path) => {
        const result = enforceScopeForRequest(scope, method, path);

        expect(result).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('write scope returns null regardless of method', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
        arbPath,
        (method, path) => {
          const result = enforceScopeForRequest('write', method, path);

          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});

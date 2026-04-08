import { describe, it, expect } from 'vitest';

import { enforceScopeForRequest } from './scope-enforcer.js';

describe('Scope Enforcer – unit tests (Requirements 14.1–14.3)', () => {
  // ── read scope ──

  it('read scope + GET /api/v1/workflows → null (allowed)', () => {
    const result = enforceScopeForRequest('read', 'GET', '/api/v1/workflows');
    expect(result).toBeNull();
  });

  it('read scope + POST /api/v1/workflows → 403', () => {
    const result = enforceScopeForRequest('read', 'POST', '/api/v1/workflows');
    expect(result).not.toBeNull();
    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body)).toEqual({ error: 'Insufficient scope' });
  });

  it('read scope + DELETE /api/v1/workflows/123 → 403', () => {
    const result = enforceScopeForRequest('read', 'DELETE', '/api/v1/workflows/123');
    expect(result).not.toBeNull();
    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body)).toEqual({ error: 'Insufficient scope' });
  });

  it('read scope + POST /api/v1/events → 403 (Req 14.3)', () => {
    const result = enforceScopeForRequest('read', 'POST', '/api/v1/events');
    expect(result).not.toBeNull();
    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body)).toEqual({ error: 'Insufficient scope' });
  });

  // ── write scope ──

  it('write scope + GET /api/v1/workflows → null (allowed)', () => {
    const result = enforceScopeForRequest('write', 'GET', '/api/v1/workflows');
    expect(result).toBeNull();
  });

  it('write scope + POST /api/v1/workflows → null (allowed)', () => {
    const result = enforceScopeForRequest('write', 'POST', '/api/v1/workflows');
    expect(result).toBeNull();
  });

  it('write scope + DELETE /api/v1/workflows/123 → null (allowed)', () => {
    const result = enforceScopeForRequest('write', 'DELETE', '/api/v1/workflows/123');
    expect(result).toBeNull();
  });

  it('write scope + POST /api/v1/events → null (allowed)', () => {
    const result = enforceScopeForRequest('write', 'POST', '/api/v1/events');
    expect(result).toBeNull();
  });
});

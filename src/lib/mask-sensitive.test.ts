import { describe, expect, it } from 'vitest';

import { maskSensitiveFields } from '../../app/lib/mask-sensitive';

const REDACTED = '••••••••';

describe('maskSensitiveFields', () => {
  describe('top-level sensitive key redaction', () => {
    it('redacts a top-level "password" key', () => {
      const result = maskSensitiveFields({ password: 'hunter2', name: 'Alice' }) as Record<string, unknown>;
      expect(result.password).toBe(REDACTED);
      expect(result.name).toBe('Alice');
    });

    it('redacts a top-level "token" key', () => {
      const result = maskSensitiveFields({ token: 'abc123', safe: true }) as Record<string, unknown>;
      expect(result.token).toBe(REDACTED);
      expect(result.safe).toBe(true);
    });

    it('redacts a top-level "secret" key', () => {
      const result = maskSensitiveFields({ secret: 'shh', other: 42 }) as Record<string, unknown>;
      expect(result.secret).toBe(REDACTED);
      expect(result.other).toBe(42);
    });

    it('redacts a top-level "key" key', () => {
      const result = maskSensitiveFields({ key: 'mykey', label: 'test' }) as Record<string, unknown>;
      expect(result.key).toBe(REDACTED);
      expect(result.label).toBe('test');
    });

    it('redacts a top-level "credential" key', () => {
      const result = maskSensitiveFields({ credential: 'cred-val', id: 1 }) as Record<string, unknown>;
      expect(result.credential).toBe(REDACTED);
      expect(result.id).toBe(1);
    });

    it('redacts a top-level "auth" key', () => {
      const result = maskSensitiveFields({ auth: 'Bearer xyz', path: '/api' }) as Record<string, unknown>;
      expect(result.auth).toBe(REDACTED);
      expect(result.path).toBe('/api');
    });

    it('preserves non-sensitive top-level fields unchanged', () => {
      const result = maskSensitiveFields({ username: 'bob', email: 'bob@example.com', age: 30 }) as Record<string, unknown>;
      expect(result.username).toBe('bob');
      expect(result.email).toBe('bob@example.com');
      expect(result.age).toBe(30);
    });
  });

  describe('nested object redaction', () => {
    it('redacts sensitive keys nested inside child objects', () => {
      const source = {
        profile: {
          apiToken: 'abc123',
          nested: { password: 'hunter2' },
        },
        safe: 'value',
      };
      const result = maskSensitiveFields(source) as typeof source;
      expect(result.profile.apiToken).toBe(REDACTED);
      expect(result.profile.nested.password).toBe(REDACTED);
      expect(result.safe).toBe('value');
    });

    it('redacts sensitive keys at multiple levels of nesting', () => {
      const source = { a: { b: { c: { secretKey: 'deep' } } } };
      const result = maskSensitiveFields(source) as Record<string, unknown>;
      const inner = (((result.a as Record<string, unknown>).b as Record<string, unknown>).c as Record<string, unknown>);
      expect(inner.secretKey).toBe(REDACTED);
    });

    it('preserves non-sensitive sibling keys in nested objects', () => {
      const source = { user: { password: 'pw', displayName: 'Alice' } };
      const result = maskSensitiveFields(source) as typeof source;
      expect(result.user.password).toBe(REDACTED);
      expect(result.user.displayName).toBe('Alice');
    });
  });

  describe('array handling', () => {
    it('redacts sensitive keys inside objects within arrays', () => {
      const source = [
        { credential: 'top-secret' },
        { data: [{ authHeader: 'Bearer test' }, { ok: true }] },
      ];
      const result = maskSensitiveFields(source) as Array<Record<string, unknown>>;
      expect(result[0].credential).toBe(REDACTED);
      const dataArr = result[1].data as Array<Record<string, unknown>>;
      expect(dataArr[0].authHeader).toBe(REDACTED);
      expect(dataArr[1].ok).toBe(true);
    });

    it('redacts sensitive keys in a flat array of objects', () => {
      const source = [{ token: 't1' }, { token: 't2' }, { name: 'safe' }];
      const result = maskSensitiveFields(source) as Array<Record<string, unknown>>;
      expect(result[0].token).toBe(REDACTED);
      expect(result[1].token).toBe(REDACTED);
      expect(result[2].name).toBe('safe');
    });

    it('returns an array of primitives unchanged', () => {
      const source = [1, 'hello', true, null];
      const result = maskSensitiveFields(source);
      expect(result).toEqual([1, 'hello', true, null]);
    });
  });

  describe('case-insensitive key matching', () => {
    it('redacts "Password" (capitalized)', () => {
      const result = maskSensitiveFields({ Password: 'pw' }) as Record<string, unknown>;
      expect(result.Password).toBe(REDACTED);
    });

    it('redacts "API_TOKEN" (all caps with underscore prefix)', () => {
      const result = maskSensitiveFields({ API_TOKEN: 'tok' }) as Record<string, unknown>;
      expect(result.API_TOKEN).toBe(REDACTED);
    });

    it('redacts "secretKey" (camelCase)', () => {
      const result = maskSensitiveFields({ secretKey: 'sk' }) as Record<string, unknown>;
      expect(result.secretKey).toBe(REDACTED);
    });

    it('redacts "AuthToken" (mixed case)', () => {
      const result = maskSensitiveFields({ AuthToken: 'at' }) as Record<string, unknown>;
      expect(result.AuthToken).toBe(REDACTED);
    });

    it('redacts "SECRET_KEY" (all caps)', () => {
      const result = maskSensitiveFields({ SECRET_KEY: '123', normalField: 'keep' }) as Record<string, unknown>;
      expect(result.SECRET_KEY).toBe(REDACTED);
      expect(result.normalField).toBe('keep');
    });

    it('redacts keys containing pattern substrings (e.g., "apiKey")', () => {
      const result = maskSensitiveFields({ apiKey: 'k', publicKey: 'pk', privateKey: 'sk' }) as Record<string, unknown>;
      expect(result.apiKey).toBe(REDACTED);
      expect(result.publicKey).toBe(REDACTED);
      expect(result.privateKey).toBe(REDACTED);
    });
  });

  describe('immutability: original input is NOT mutated', () => {
    it('does not mutate the original top-level object', () => {
      const source = { password: 'secret', name: 'Alice' };
      maskSensitiveFields(source);
      expect(source.password).toBe('secret');
      expect(source.name).toBe('Alice');
    });

    it('does not mutate nested objects', () => {
      const source = { profile: { apiToken: 'abc123', nested: { password: 'hunter2' } } };
      maskSensitiveFields(source);
      expect(source.profile.apiToken).toBe('abc123');
      expect(source.profile.nested.password).toBe('hunter2');
    });

    it('does not mutate objects inside arrays', () => {
      const source = [{ token: 'original' }, { safe: 'data' }];
      maskSensitiveFields(source);
      expect(source[0].token).toBe('original');
      expect(source[1].safe).toBe('data');
    });
  });

  describe('non-object (primitive) inputs are returned unchanged', () => {
    it('returns a string unchanged', () => {
      expect(maskSensitiveFields('hello')).toBe('hello');
    });

    it('returns a number unchanged', () => {
      expect(maskSensitiveFields(42)).toBe(42);
    });

    it('returns a boolean unchanged', () => {
      expect(maskSensitiveFields(true)).toBe(true);
      expect(maskSensitiveFields(false)).toBe(false);
    });

    it('returns null unchanged', () => {
      expect(maskSensitiveFields(null)).toBeNull();
    });

    it('returns undefined unchanged', () => {
      expect(maskSensitiveFields(undefined)).toBeUndefined();
    });

    it('returns zero unchanged', () => {
      expect(maskSensitiveFields(0)).toBe(0);
    });

    it('returns an empty string unchanged', () => {
      expect(maskSensitiveFields('')).toBe('');
    });
  });

  describe('edge cases', () => {
    it('handles an empty object', () => {
      expect(maskSensitiveFields({})).toEqual({});
    });

    it('handles an empty array', () => {
      expect(maskSensitiveFields([])).toEqual([]);
    });

    it('redacts sensitive keys whose values are objects', () => {
      const result = maskSensitiveFields({ credentials: { user: 'bob', pass: 'pw' } }) as Record<string, unknown>;
      expect(result.credentials).toBe(REDACTED);
    });

    it('redacts sensitive keys whose values are null', () => {
      const result = maskSensitiveFields({ password: null }) as Record<string, unknown>;
      expect(result.password).toBe(REDACTED);
    });

    it('redacts sensitive keys whose values are numbers', () => {
      const result = maskSensitiveFields({ secretCode: 1234 }) as Record<string, unknown>;
      expect(result.secretCode).toBe(REDACTED);
    });
  });
});

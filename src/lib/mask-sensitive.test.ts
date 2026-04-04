import { describe, expect, it } from 'vitest';

import { maskSensitiveFields } from '../../app/lib/mask-sensitive';

describe('maskSensitiveFields', () => {
  it('masks nested sensitive keys without mutating original object', () => {
    const source = {
      profile: {
        apiToken: 'abc123',
        nested: { password: 'hunter2' },
      },
      safe: 'value',
    };

    const result = maskSensitiveFields(source) as typeof source;

    expect(result.profile.apiToken).toBe('••••••••');
    expect(result.profile.nested.password).toBe('••••••••');
    expect(result.safe).toBe('value');
    expect(source.profile.apiToken).toBe('abc123');
  });

  it('masks sensitive keys inside arrays', () => {
    const source = [
      { credential: 'top-secret' },
      { data: [{ authHeader: 'Bearer test' }, { ok: true }] },
    ];

    const result = maskSensitiveFields(source) as Array<Record<string, unknown>>;

    expect(result[0].credential).toBe('••••••••');
    expect(((result[1].data as Array<Record<string, unknown>>)[0]).authHeader).toBe('••••••••');
  });

  it('supports key name variants', () => {
    const source = {
      SECRET_KEY: '123',
      AuthToken: 'xyz',
      normalField: 'keep',
    };

    const result = maskSensitiveFields(source) as typeof source;

    expect(result.SECRET_KEY).toBe('••••••••');
    expect(result.AuthToken).toBe('••••••••');
    expect(result.normalField).toBe('keep');
  });
});

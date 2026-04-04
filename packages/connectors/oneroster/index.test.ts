import { describe, expect, it, vi } from 'vitest';
import {
  applyFieldMappings,
  BatchSyncThresholdError,
  buildEnrollmentsUrl,
  oneRosterConnector,
  type OneRosterParams,
} from './index.js';

describe('applyFieldMappings', () => {
  it('maps fields correctly', () => {
    const result = applyFieldMappings(
      { sourcedId: 'u1', givenName: 'Ava' },
      [
        { sourceField: 'sourcedId', targetField: 'id' },
        { sourceField: 'givenName', targetField: 'firstName' },
      ],
    );

    expect(result).toEqual({ id: 'u1', firstName: 'Ava' });
  });

  it('skips missing source fields and ignores extra record fields', () => {
    const result = applyFieldMappings(
      { sourcedId: 'u1', familyName: 'Nguyen', role: 'student' },
      [
        { sourceField: 'sourcedId', targetField: 'id' },
        { sourceField: 'givenName', targetField: 'firstName' },
      ],
    );

    expect(result).toEqual({ id: 'u1' });
    expect(result).not.toHaveProperty('role');
  });
});

describe('buildEnrollmentsUrl', () => {
  it('constructs delta filter query string', () => {
    const url = buildEnrollmentsUrl('https://district.example', '2026-04-04T00:00:00Z');
    const parsed = new URL(url);

    expect(parsed.pathname).toBe('/ims/oneroster/v1p1/enrollments');
    expect(parsed.searchParams.get('filter')).toBe("dateLastModified>'2026-04-04T00:00:00Z'");
  });
});

describe('oneRosterConnector threshold behavior', () => {
  it('throws BatchSyncThresholdError when error rate exceeds 20%', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'token' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            enrollments: [
              { sourcedId: 'e1', userSourcedId: 'u1' },
              { sourcedId: 'e2', userSourcedId: 'u2' },
              { sourcedId: 'e3', userSourcedId: 'u3' },
              { sourcedId: 'e4', userSourcedId: 'u4' },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('oops', { status: 500 }));

    vi.stubGlobal('fetch', fetchMock);

    const params: OneRosterParams = {
      baseUrl: 'https://district.example',
      syncScope: 'full',
      fieldMappings: [{ sourceField: 'sourcedId', targetField: 'id' }],
      clientId: 'client',
      clientSecret: 'secret',
    };

    await expect(
      oneRosterConnector.run(params, {
        tenantId: 'tenant-1',
        runId: 'run-1',
        s3Client: { putObject: vi.fn(async () => ({})) },
      }),
    ).rejects.toBeInstanceOf(BatchSyncThresholdError);

    vi.unstubAllGlobals();
  });
});

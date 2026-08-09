import { describe, expect, it } from 'vitest';
import { AuthorizationError, ValidationError } from '@/shared/errors';
import {
  assertApiKeyHasAnyScope,
  assertApiKeyHasScope,
} from '@/modules/api/application/assert-api-scope';
import { assertNoClientOrganizationOverride } from '@/modules/api/http/tenant-guard';
import type { AuthenticatedApiKey } from '@/modules/api/domain/types';
import {
  API_DEFAULT_PAGE_SIZE,
  API_MAX_PAGE_SIZE,
  nextCursorFromItems,
  parseApiPagination,
} from '@/modules/api/http/pagination';
import { API_VERSION, apiError, apiErrorCode, apiSuccess } from '@/modules/api/http/api-response';

const baseAuth: AuthenticatedApiKey = {
  keyId: '00000000-0000-4000-8000-000000000001',
  apiClientId: '00000000-0000-4000-8000-000000000002',
  organizationId: '00000000-0000-4000-8000-000000000003',
  scopes: ['projects.read'],
  clientName: 'test',
};

describe('assertApiKeyHasScope', () => {
  it('allows matching scope', () => {
    expect(() => assertApiKeyHasScope(baseAuth, 'projects.read')).not.toThrow();
  });

  it('rejects missing scope', () => {
    expect(() => assertApiKeyHasScope(baseAuth, 'billing.read')).toThrow(AuthorizationError);
  });

  it('allows any of listed scopes', () => {
    expect(() =>
      assertApiKeyHasAnyScope(baseAuth, ['billing.read', 'projects.read']),
    ).not.toThrow();
  });

  it('rejects when none of listed scopes match', () => {
    expect(() =>
      assertApiKeyHasAnyScope(baseAuth, ['billing.read', 'clients.read']),
    ).toThrow(AuthorizationError);
  });
});

describe('assertNoClientOrganizationOverride', () => {
  it('allows requests without organizationId', () => {
    expect(() =>
      assertNoClientOrganizationOverride(new URLSearchParams({ limit: '10' })),
    ).not.toThrow();
  });

  it('rejects client-supplied organizationId tenant probes', () => {
    expect(() =>
      assertNoClientOrganizationOverride(
        new URLSearchParams({ organizationId: '00000000-0000-4000-8000-000000000099' }),
      ),
    ).toThrow(ValidationError);
  });
});

describe('versioned API responses', () => {
  it('wraps success with apiVersion', async () => {
    const res = apiSuccess({ ok: true });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ apiVersion: API_VERSION, ok: true });
  });

  it('serializes app errors without leakage', async () => {
    const res = apiError(new ValidationError([{ path: 'name', message: 'required' }]));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.apiVersion).toBe('v1');
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.issues).toEqual([{ path: 'name', message: 'required' }]);
    expect(JSON.stringify(body)).not.toMatch(/stack|password|keyHash/i);
  });

  it('emits coded errors for auth probes', async () => {
    const res = apiErrorCode('missing_api_key', 401, 'errors.authenticationRequired');
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      apiVersion: 'v1',
      error: { code: 'missing_api_key', messageKey: 'errors.authenticationRequired' },
    });
  });
});

describe('API pagination helpers', () => {
  it('parses limit and cursor with caps', () => {
    const params = new URLSearchParams({
      limit: '999',
      cursor: '2026-08-09T12:00:00.000Z',
    });
    expect(parseApiPagination(params)).toEqual({
      limit: API_MAX_PAGE_SIZE,
      cursor: '2026-08-09T12:00:00.000Z',
    });
    expect(parseApiPagination(new URLSearchParams())).toEqual({
      limit: API_DEFAULT_PAGE_SIZE,
      cursor: null,
    });
    expect(parseApiPagination(new URLSearchParams({ cursor: 'not-a-date' })).cursor).toBeNull();
  });

  it('builds nextCursor only when page is full', () => {
    const items = [
      { createdAt: new Date('2026-08-09T12:00:00.000Z') },
      { createdAt: new Date('2026-08-09T11:00:00.000Z') },
    ];
    expect(nextCursorFromItems(items, 2)).toBe('2026-08-09T11:00:00.000Z');
    expect(nextCursorFromItems(items, 3)).toBeNull();
  });
});

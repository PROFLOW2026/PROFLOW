import { describe, expect, it, vi, afterEach } from 'vitest';
import { ProviderHttpError, providerJson } from '@/modules/external-storage/providers/http-utils';

describe('providerJson Content-Type', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses application/json for JSON string bodies', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = init.headers as Headers;
      expect(headers.get('Content-Type')).toBe('application/json');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await providerJson('/test', {
      method: 'POST',
      body: JSON.stringify({ name: 'ProjectFlow', folder: {} }),
    });
  });

  it('uses form encoding for OAuth-style string bodies', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = init.headers as Headers;
      expect(headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
      return new Response(JSON.stringify({ access_token: 'x' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await providerJson('/token', {
      method: 'POST',
      body: 'client_id=a&grant_type=authorization_code',
    });
  });
});

describe('ProviderHttpError classification', () => {
  it('treats Google Drive throttle 403 reasons as transient, not auth', () => {
    for (const reason of [
      'rateLimitExceeded',
      'userRateLimitExceeded',
      'sharingRateLimitExceeded',
      'dailyLimitExceeded',
    ]) {
      const error = new ProviderHttpError(
        403,
        JSON.stringify({ error: { errors: [{ reason }], code: 403, message: 'Rate Limit Exceeded' } }),
      );
      expect(error.isThrottleLike()).toBe(true);
      expect(error.isTransient()).toBe(true);
      expect(error.isUnauthorized()).toBe(false);
    }
  });

  it('treats real auth/permission 403 as unauthorized, not transient', () => {
    const error = new ProviderHttpError(
      403,
      JSON.stringify({
        error: {
          errors: [{ reason: 'insufficientPermissions', message: 'Insufficient Permission' }],
          code: 403,
        },
      }),
    );
    expect(error.isThrottleLike()).toBe(false);
    expect(error.isTransient()).toBe(false);
    expect(error.isUnauthorized()).toBe(true);
  });

  it('keeps HTTP 429 on the shared transient retry path', () => {
    const error = new ProviderHttpError(429, 'Too Many Requests');
    expect(error.isTransient()).toBe(true);
    expect(error.isUnauthorized()).toBe(false);
  });

  it('keeps permanent storage quota as quota-exceeded (non-auth)', () => {
    const error = new ProviderHttpError(
      403,
      JSON.stringify({ error: { errors: [{ reason: 'storageQuotaExceeded' }], code: 403 } }),
    );
    expect(error.isQuotaExceeded()).toBe(true);
    expect(error.isUnauthorized()).toBe(true); // no throttle reason → still permission-class 403
    // Provision path checks isTransient first, then isQuotaExceeded — verify quota signal intact.
    expect(error.isTransient()).toBe(false);

    const hardQuota = new ProviderHttpError(507, 'Insufficient Storage');
    expect(hardQuota.isQuotaExceeded()).toBe(true);
    expect(hardQuota.isTransient()).toBe(true); // 5xx is transient at HTTP layer; quota check is separate
  });

  it('does not treat OneDrive/Dropbox/Box plain 403 as throttle without reason text', () => {
    for (const body of [
      '{"error":{"code":"accessDenied","message":"Access denied"}}',
      '{"error_summary":"forbidden","error":{".tag":"path","path":{".tag":"restricted_content"}}}',
      '{"type":"error","code":"access_denied_insufficient_permissions","status":403}',
    ]) {
      const error = new ProviderHttpError(403, body);
      expect(error.isThrottleLike()).toBe(false);
      expect(error.isTransient()).toBe(false);
      expect(error.isUnauthorized()).toBe(true);
    }
  });
});

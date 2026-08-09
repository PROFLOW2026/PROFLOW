import { afterEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  apiScopesArePermissionEquivalent,
  permissionForApiScope,
  permissionsForApiScopes,
} from '@/modules/api/domain/scope-permissions';
import {
  buildWebhookEventEnvelope,
  extractWebhookEventId,
  isWebhookEventId,
} from '@/modules/api/domain/webhook-envelope';
import {
  buildWebhookSignatureHeaders,
  verifyWebhookSignature,
  WEBHOOK_SIGNATURE_HEADER,
} from '@/modules/api/domain/webhook-signature';
import {
  deriveWebhookSecretKek,
  isSealedWebhookSecret,
  openWebhookSecret,
  sealWebhookSecret,
  webhookSecretMatchesStored,
} from '@/modules/api/domain/webhook-secret-seal';
import { hashSecret } from '@/modules/api/domain/api-key';
import { parseApiPagination, nextCursorFromItems } from '@/modules/api/http/pagination';
import { parseDeliveryHttpStatus } from '@/modules/api/domain/delivery-state';

vi.mock('server-only', () => ({}));

describe('API scope ↔ UI permission equivalence', () => {
  it('maps foundation scopes onto UI permission keys', () => {
    expect(permissionForApiScope('projects.read')).toBe(PERMISSIONS.PROJECTS_READ);
    expect(permissionForApiScope('clients.read')).toBe(PERMISSIONS.CLIENTS_READ);
    expect(permissionForApiScope('billing.read')).toBe(PERMISSIONS.BILLING_READ);
    expect(permissionForApiScope('webhooks.manage')).toBe(PERMISSIONS.API_MANAGE);
  });

  it('rejects unknown scopes and builds permission sets', () => {
    expect(apiScopesArePermissionEquivalent(['projects.read', 'evil.admin'])).toBe(false);
    expect(apiScopesArePermissionEquivalent(['projects.read', 'billing.read'])).toBe(true);
    const set = permissionsForApiScopes(['projects.read', 'webhooks.manage']);
    expect(set.has(PERMISSIONS.PROJECTS_READ)).toBe(true);
    expect(set.has(PERMISSIONS.API_MANAGE)).toBe(true);
    expect(set.has(PERMISSIONS.BILLING_READ)).toBe(false);
  });

  it('strips unknown scopes so rotate cannot re-issue elevated aliases', () => {
    const raw = ['projects.read', 'org.admin', 'billing.read'] as const;
    const normalized = raw.filter((scope) =>
      (['projects.read', 'clients.read', 'billing.read', 'webhooks.manage'] as const).includes(
        scope as 'projects.read',
      ),
    );
    expect(normalized).toEqual(['projects.read', 'billing.read']);
    expect(apiScopesArePermissionEquivalent(normalized)).toBe(true);
    expect(apiScopesArePermissionEquivalent(raw)).toBe(false);
  });
});

describe('webhook event envelope + signature', () => {
  it('builds envelopes with stable UUID event ids', () => {
    const envelope = buildWebhookEventEnvelope({
      eventType: 'test.ping',
      data: { ok: true },
      eventId: '00000000-0000-4000-8000-0000000000aa',
    });
    expect(envelope.eventId).toBe('00000000-0000-4000-8000-0000000000aa');
    expect(isWebhookEventId(envelope.eventId)).toBe(true);
    expect(extractWebhookEventId(envelope)).toBe(envelope.eventId);
  });

  it('signs and verifies with timestamp tolerance (replay window)', () => {
    const secret = 'whsec_test_secret_value';
    const body = JSON.stringify({ eventId: '00000000-0000-4000-8000-0000000000bb', ok: true });
    const now = 1_700_000_000;
    const signed = buildWebhookSignatureHeaders({
      plaintextSecret: secret,
      body,
      eventId: '00000000-0000-4000-8000-0000000000bb',
      timestampSeconds: now,
    });

    expect(signed.headers[WEBHOOK_SIGNATURE_HEADER]).toMatch(/^t=\d+,v1=[0-9a-f]+$/);
    expect(
      verifyWebhookSignature({
        plaintextSecret: secret,
        body,
        signatureHeader: signed.headers[WEBHOOK_SIGNATURE_HEADER]!,
        nowSeconds: now,
      }),
    ).toBe(true);

    expect(
      verifyWebhookSignature({
        plaintextSecret: secret,
        body,
        signatureHeader: signed.headers[WEBHOOK_SIGNATURE_HEADER]!,
        nowSeconds: now + 10_000,
        toleranceSeconds: 300,
      }),
    ).toBe(false);
  });
});

describe('webhook secret seal', () => {
  it('seals and opens secrets without storing plaintext', () => {
    const kek = deriveWebhookSecretKek('unit-test-kek-material');
    const plaintext = 'whsec_plaintext_once';
    const sealed = sealWebhookSecret(plaintext, kek);
    expect(isSealedWebhookSecret(sealed)).toBe(true);
    expect(sealed).not.toContain(plaintext);
    expect(openWebhookSecret(sealed, kek)).toBe(plaintext);
    expect(
      webhookSecretMatchesStored(plaintext, sealed, { kek, hashPlaintext: hashSecret }),
    ).toBe(true);
    expect(
      webhookSecretMatchesStored('wrong', sealed, { kek, hashPlaintext: hashSecret }),
    ).toBe(false);
  });

  it('still matches legacy hash-only rows', () => {
    const plaintext = 'whsec_legacy';
    const hash = hashSecret(plaintext);
    expect(
      webhookSecretMatchesStored(plaintext, hash, { hashPlaintext: hashSecret }),
    ).toBe(true);
  });
});

describe('webhook KEK production guard', () => {
  const previous = {
    APP_ENV: process.env.APP_ENV,
    WEBHOOK_SECRET_KEK: process.env.WEBHOOK_SECRET_KEK,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('requires explicit WEBHOOK_SECRET_KEK in production', async () => {
    process.env.APP_ENV = 'production';
    delete process.env.WEBHOOK_SECRET_KEK;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-must-not-be-kek';
    process.env.DATABASE_URL = 'postgres://example/db';

    const { resolveWebhookSecretKek } = await import('@/modules/api/application/webhook-kek');
    expect(() => resolveWebhookSecretKek()).toThrow(/WEBHOOK_SECRET_KEK/);
  });

  it('uses explicit KEK in production', async () => {
    process.env.APP_ENV = 'production';
    process.env.WEBHOOK_SECRET_KEK = 'a'.repeat(64);

    const { resolveWebhookSecretKek } = await import('@/modules/api/application/webhook-kek');
    const kek = resolveWebhookSecretKek();
    expect(kek).toHaveLength(32);
  });
});

describe('pagination + http status parse', () => {
  it('clamps limit and validates cursor', () => {
    const params = new URLSearchParams('limit=999&cursor=2026-08-01T00:00:00.000Z');
    expect(parseApiPagination(params)).toEqual({
      limit: 100,
      cursor: '2026-08-01T00:00:00.000Z',
    });
    expect(parseApiPagination(new URLSearchParams('cursor=not-a-date')).cursor).toBeNull();
  });

  it('computes nextCursor from createdAt pages', () => {
    const items = [
      { createdAt: new Date('2026-08-09T12:00:00.000Z') },
      { createdAt: new Date('2026-08-09T11:00:00.000Z') },
    ];
    expect(nextCursorFromItems(items, 2)).toBe('2026-08-09T11:00:00.000Z');
    expect(nextCursorFromItems(items, 3)).toBeNull();
  });

  it('parses HTTP status from delivery lastError', () => {
    expect(parseDeliveryHttpStatus('HTTP 503: upstream')).toBe(503);
    expect(parseDeliveryHttpStatus('timeout')).toBeNull();
  });
});

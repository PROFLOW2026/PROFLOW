import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STATUTORY_SHARE_TTL_MS,
  createStatutoryShareToken,
  verifyStatutoryShareToken,
} from '@/modules/invoicing-integration/application/statutory-share-token';

const TEST_KEY = 'a'.repeat(32);

describe('statutory share token', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('round-trips organization, document, and link ids', () => {
    vi.stubEnv('STATUTORY_SHARE_SIGNING_KEY', TEST_KEY);
    const token = createStatutoryShareToken({
      organizationId: 'b1460c82-36cd-429a-b30d-ea5644d58fe3',
      externalDocumentId: 'doc-uuid',
      linkId: 'link-uuid',
    });
    const verified = verifyStatutoryShareToken(token);
    expect(verified.organizationId).toBe('b1460c82-36cd-429a-b30d-ea5644d58fe3');
    expect(verified.externalDocumentId).toBe('doc-uuid');
    expect(verified.linkId).toBe('link-uuid');
  });

  it('rejects when signing key is missing', () => {
    vi.stubEnv('STATUTORY_SHARE_SIGNING_KEY', '');
    expect(() =>
      createStatutoryShareToken({
        organizationId: 'org',
        externalDocumentId: 'doc',
        linkId: 'link',
      }),
    ).toThrow(/shareUnavailable|Statutory share unavailable/);
  });

  it('rejects tokens without linkId in payload', () => {
    vi.stubEnv('STATUTORY_SHARE_SIGNING_KEY', TEST_KEY);
    const payload = JSON.stringify({
      organizationId: 'org',
      externalDocumentId: 'doc',
      exp: Date.now() + STATUTORY_SHARE_TTL_MS,
    });
    const encoded = Buffer.from(payload, 'utf8').toString('base64url');
    const sig = createHmac('sha256', TEST_KEY).update(encoded).digest('base64url');
    expect(() => verifyStatutoryShareToken(`${encoded}.${sig}`)).toThrow(/shareInvalid|Invalid share link/);
  });

  it('rejects expired tokens', () => {
    vi.stubEnv('STATUTORY_SHARE_SIGNING_KEY', TEST_KEY);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = createStatutoryShareToken({
      organizationId: 'org',
      externalDocumentId: 'doc',
      linkId: 'link',
    });
    vi.setSystemTime(new Date('2026-01-20T00:00:00Z'));
    expect(() => verifyStatutoryShareToken(token)).toThrow(/shareExpired|Share link expired/);
  });

  it('rejects tampered tokens', () => {
    vi.stubEnv('STATUTORY_SHARE_SIGNING_KEY', TEST_KEY);
    const token = createStatutoryShareToken({
      organizationId: 'org',
      externalDocumentId: 'doc',
      linkId: 'link',
    });
    expect(() => verifyStatutoryShareToken(`${token}x`)).toThrow();
  });
});

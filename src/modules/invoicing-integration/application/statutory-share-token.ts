import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/shared/env/server';
import { DomainRuleError } from '@/shared/errors';
import { statutoryShareSigningKey } from './statutory-share-availability';

export const STATUTORY_SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function shareSecret(): string {
  const key = statutoryShareSigningKey();
  if (!key) {
    throw new DomainRuleError(
      'Statutory share unavailable',
      'invoicingIntegration.errors.shareUnavailable',
    );
  }
  return key;
}

export function createStatutoryShareToken(input: {
  organizationId: string;
  externalDocumentId: string;
  linkId: string;
}): string {
  const payload = JSON.stringify({
    organizationId: input.organizationId,
    externalDocumentId: input.externalDocumentId,
    linkId: input.linkId,
    exp: Date.now() + STATUTORY_SHARE_TTL_MS,
  });
  const encoded = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = createHmac('sha256', shareSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyStatutoryShareToken(token: string): {
  organizationId: string;
  externalDocumentId: string;
  linkId: string;
} {
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) {
    throw new DomainRuleError('Invalid share link', 'invoicingIntegration.errors.shareInvalid');
  }
  const expected = createHmac('sha256', shareSecret()).update(encoded).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new DomainRuleError('Invalid share link', 'invoicingIntegration.errors.shareInvalid');
  }
  const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
    organizationId?: string;
    externalDocumentId?: string;
    linkId?: string;
    exp?: number;
  };
  if (!parsed.organizationId || !parsed.externalDocumentId || !parsed.linkId || !parsed.exp) {
    throw new DomainRuleError('Invalid share link', 'invoicingIntegration.errors.shareInvalid');
  }
  if (Date.now() > parsed.exp) {
    throw new DomainRuleError('Share link expired', 'invoicingIntegration.errors.shareExpired');
  }
  return {
    organizationId: parsed.organizationId,
    externalDocumentId: parsed.externalDocumentId,
    linkId: parsed.linkId,
  };
}

export function buildStatutoryShareUrl(token: string): string {
  const base = serverEnv().APP_URL.replace(/\/+$/, '');
  return `${base}/api/invoicing/statutory/share/${encodeURIComponent(token)}/pdf`;
}

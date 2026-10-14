import 'server-only';

import { createHash } from 'node:crypto';
import { DomainRuleError } from '@/shared/errors';
import {
  areStatutoryShareLinksTablesAvailable,
  refreshStatutoryShareLinksTableAvailability,
} from '../data/statutory-share-persistence';

const MIN_KEY_BYTES = 32;

export function statutoryShareSigningKey(): string | null {
  const raw = process.env.STATUTORY_SHARE_SIGNING_KEY?.trim();
  if (!raw) return null;
  if (Buffer.byteLength(raw, 'utf8') < MIN_KEY_BYTES) return null;
  return raw;
}

/** Share links require dedicated signing key and persisted link rows (0187). */
export async function assertStatutoryShareAvailable(): Promise<void> {
  if (!statutoryShareSigningKey()) {
    throw new DomainRuleError(
      'Statutory share unavailable',
      'invoicingIntegration.errors.shareUnavailable',
    );
  }
  await refreshStatutoryShareLinksTableAvailability();
  if (!areStatutoryShareLinksTablesAvailable()) {
    throw new DomainRuleError(
      'Statutory share unavailable',
      'invoicingIntegration.errors.shareUnavailable',
    );
  }
}

export async function isStatutoryShareAvailable(): Promise<boolean> {
  try {
    await assertStatutoryShareAvailable();
    return true;
  } catch {
    return false;
  }
}

export function hashStatutoryShareToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

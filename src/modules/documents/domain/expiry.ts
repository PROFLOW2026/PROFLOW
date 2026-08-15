/**
 * Expiry is a display concern on the logical document, not on a stored version.
 */

export type DocumentExpiryState = 'none' | 'expiring' | 'expired';

const EXPIRING_SOON_DAYS = 30;

function todayIsoDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function documentExpiryState(
  expiresAt: string | null | undefined,
  now = new Date(),
): DocumentExpiryState {
  if (!expiresAt) return 'none';
  const today = todayIsoDate(now);
  if (expiresAt < today) return 'expired';
  const limit = new Date(now);
  limit.setUTCDate(limit.getUTCDate() + EXPIRING_SOON_DAYS);
  if (expiresAt <= limit.toISOString().slice(0, 10)) return 'expiring';
  return 'none';
}

import { createHash } from 'node:crypto';

/** One-time supplier quote link validity (matches invitation-style TTL). */
export const SUPPLIER_RFQ_ACCESS_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function hashSupplierRfqAccessToken(rawToken: string): string {
  return createHash('sha256').update(rawToken.trim(), 'utf8').digest('hex');
}

export function isSupplierRfqAccessTokenExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function isSupplierRfqAccessTokenConsumed(usedAt: Date | null | undefined): boolean {
  return usedAt != null;
}

export type SupplierRfqAccessTokenValidity =
  | { readonly kind: 'valid' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'used' };

export function assessSupplierRfqAccessTokenValidity(input: {
  readonly expiresAt: Date;
  readonly usedAt: Date | null | undefined;
  readonly now?: Date;
}): SupplierRfqAccessTokenValidity {
  if (isSupplierRfqAccessTokenConsumed(input.usedAt)) {
    return { kind: 'used' };
  }
  if (isSupplierRfqAccessTokenExpired(input.expiresAt, input.now)) {
    return { kind: 'expired' };
  }
  return { kind: 'valid' };
}

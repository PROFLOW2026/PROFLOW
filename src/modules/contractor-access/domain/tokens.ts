import { createHash, randomBytes } from 'node:crypto';

/** Invite / password-reset tokens: random 256-bit secrets; only the sha256 hash is stored. */

export type ContractorTokenPurpose = 'invite' | 'password_reset';

export const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function generateContractorToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashContractorToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function tokenExpiry(purpose: ContractorTokenPurpose, now: Date = new Date()): Date {
  return new Date(now.getTime() + (purpose === 'invite' ? INVITE_TOKEN_TTL_MS : RESET_TOKEN_TTL_MS));
}

export function isPlausibleToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32,128}$/.test(token);
}

export type TokenState = 'valid' | 'expired' | 'consumed' | 'revoked';

export function tokenState(
  token: { expiresAt: Date; consumedAt: Date | null; revokedAt: Date | null },
  now: Date = new Date(),
): TokenState {
  if (token.revokedAt) return 'revoked';
  if (token.consumedAt) return 'consumed';
  if (token.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'valid';
}

export function contractorTokenPath(locale: string, purpose: ContractorTokenPurpose, token: string): string {
  const page = purpose === 'invite' ? 'activate' : 'reset-password';
  return `/${locale}/contractor/${page}?token=${encodeURIComponent(token)}`;
}

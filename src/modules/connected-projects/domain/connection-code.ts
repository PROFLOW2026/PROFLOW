import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Connection codes: random 256-bit secrets; only SHA-256 hex is stored (same as contractor tokens). */

export const CONNECTION_CODE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function generateConnectionCode(): string {
  return randomBytes(32).toString('base64url');
}

export function hashConnectionCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

export function connectionCodeExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + CONNECTION_CODE_TTL_MS);
}

export function isPlausibleConnectionCode(code: string): boolean {
  return /^[A-Za-z0-9_-]{32,128}$/.test(code.trim());
}

export function connectionCodesEqual(storedHash: string, candidateCode: string): boolean {
  const candidateHash = hashConnectionCode(candidateCode.trim());
  const a = Buffer.from(storedHash, 'utf8');
  const b = Buffer.from(candidateHash, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SealedJobToken {
  readonly jobId: string;
  readonly expiresAtMs: number;
  readonly bearer: string;
  readonly hash: string;
}

export function sealJobToken(jobId: string, secret: string, ttlMs: number, nowMs: number): SealedJobToken {
  const expiresAtMs = nowMs + ttlMs;
  const payload = `${jobId}.${expiresAtMs}`;
  const mac = createHmac('sha256', secret).update(payload).digest('base64url');
  const bearer = `${payload}.${mac}`;
  const hash = createHmac('sha256', secret).update(bearer).digest('hex');
  return { jobId, expiresAtMs, bearer, hash };
}

export function verifyJobBearer(bearer: string, secret: string, nowMs: number): { jobId: string } | null {
  const parts = bearer.split('.');
  if (parts.length !== 3) return null;
  const jobId = parts[0];
  const expRaw = parts[1];
  const mac = parts[2];
  if (!jobId || !expRaw || !mac) return null;
  const expiresAtMs = Number(expRaw);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < nowMs) return null;
  const expected = createHmac('sha256', secret).update(`${jobId}.${expiresAtMs}`).digest('base64url');
  const a = new Uint8Array(Buffer.from(mac, 'utf8'));
  const b = new Uint8Array(Buffer.from(expected, 'utf8'));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { jobId };
}

export function hashStoredToken(bearer: string, secret: string): string {
  return createHmac('sha256', secret).update(bearer).digest('hex');
}

export function verifyStoredTokenHash(bearer: string, secret: string, storedHash: string): boolean {
  const hash = hashStoredToken(bearer, secret);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
import { createHash } from 'node:crypto';

/**
 * Distributed auth-attempt caps (S-07). There is no Redis.
 *
 * Main sign-in, sign-up, employee PIN login, and contractor password sign-in
 * share this gate. Live-share join stays public: callers send only a hash of
 * the viewer token, never a session. Calendar feed access hashes the feed
 * token the same way. Raw emails are never sent to SQL.
 *
 * `app.consume_auth_rate_limit` counts every call in the window (attempts, not
 * failures only). Live-share (30 / 60s) and the calendar feed (120 / 60s) match
 * the existing per-instance brakes. Login surfaces share one attempt cap.
 */
export const AUTH_RATE_LIMIT_POLICIES = {
  sign_in: { windowSeconds: 15 * 60, limit: 10 },
  sign_up: { windowSeconds: 60 * 60, limit: 5 },
  employee_login: { windowSeconds: 15 * 60, limit: 10 },
  contractor_sign_in: { windowSeconds: 15 * 60, limit: 10 },
  live_share_join: { windowSeconds: 60, limit: 30 },
  calendar_feed: { windowSeconds: 60, limit: 120 },
} as const;

export type AuthRateLimitScope = keyof typeof AUTH_RATE_LIMIT_POLICIES;

const TOKEN_SCOPES = new Set<AuthRateLimitScope>(['live_share_join', 'calendar_feed']);

/** SHA-256 hex digest. Always 64 hex characters, so the result cannot contain `@`. */
export function hashAuthRateLimitKey(identifier: string): string {
  return createHash('sha256').update(identifier, 'utf8').digest('hex');
}

/**
 * Emails and usernames are trimmed and lower-cased so casing is not a bypass.
 * Viewer tokens and calendar feed tokens keep their case.
 */
export function normalizeAuthRateLimitIdentifier(
  scope: AuthRateLimitScope,
  identifier: string,
): string {
  const trimmed = identifier.trim();
  if (TOKEN_SCOPES.has(scope)) return trimmed;
  return trimmed.toLowerCase();
}

export function authRateLimitGranted(consumed: unknown): boolean {
  return consumed === true || consumed === 't' || consumed === 'true';
}

export function readAuthRateLimitAllowed(result: unknown): boolean {
  const rows = Array.isArray(result)
    ? result
    : result &&
        typeof result === 'object' &&
        Array.isArray((result as { rows?: unknown }).rows)
      ? (result as { rows: unknown[] }).rows
      : [];
  const row = rows[0];
  if (!row || typeof row !== 'object') return false;
  const record = row as { allowed?: unknown; consume_auth_rate_limit?: unknown };
  return authRateLimitGranted(record.allowed ?? record.consume_auth_rate_limit);
}

/**
 * Hashes `identifier`, then asks `consume` (SQL, or a test double).
 * A denied consume result blocks the attempt. A thrown consume also blocks,
 * so a missing limiter cannot be treated as unlimited.
 */
export async function authAttemptPermitted(
  identifier: string,
  consume: (keyHash: string) => Promise<boolean>,
): Promise<boolean> {
  if (!identifier) return false;
  const keyHash = hashAuthRateLimitKey(identifier);
  if (keyHash.length !== 64 || keyHash.includes('@') || !/^[0-9a-f]{64}$/.test(keyHash)) {
    return false;
  }
  try {
    return authRateLimitGranted(await consume(keyHash));
  } catch {
    return false;
  }
}

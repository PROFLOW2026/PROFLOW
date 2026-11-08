import 'server-only';

import { sql } from 'drizzle-orm';
import {
  AUTH_RATE_LIMIT_POLICIES,
  authAttemptPermitted,
  normalizeAuthRateLimitIdentifier,
  readAuthRateLimitAllowed,
  type AuthRateLimitScope,
} from '@/shared/auth/auth-rate-limit';
import { getAdminDb } from '@/shared/db/client';
import type { DbExecutor } from '@/shared/db/types';

/**
 * One attempt against `app.consume_auth_rate_limit(scope, key_hash, window_seconds, limit)`.
 * Only the SHA-256 hex hash is sent. Callers turn `false` into the surface's existing
 * generic rate-limit or authentication failure.
 *
 * The service connection is used when the caller has no session yet (sign-in, sign-up,
 * public live-share, unauthenticated calendar feed). Pass `db` when the caller already
 * holds that service connection.
 */
export async function permitScopedAuthAttempt(
  scope: AuthRateLimitScope,
  identifier: string,
  db?: DbExecutor,
): Promise<boolean> {
  const normalized = normalizeAuthRateLimitIdentifier(scope, identifier);
  if (!normalized) return false;
  const policy = AUTH_RATE_LIMIT_POLICIES[scope];
  const executor = db ?? getAdminDb();
  return authAttemptPermitted(normalized, async (keyHash) => {
    try {
      const result = await executor.execute(sql`
        SELECT app.consume_auth_rate_limit(
          ${scope}::text,
          ${keyHash}::text,
          ${policy.windowSeconds}::integer,
          ${policy.limit}::integer
        ) AS allowed
      `);
      return readAuthRateLimitAllowed(result);
    } catch {
      // Fail closed: app.consume_auth_rate_limit comes from migration 0199, which
      // is prepared and may not be applied. A missing function (or any other SQL
      // error) must not open unlimited attempts.
      return false;
    }
  });
}

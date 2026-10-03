import { createHash } from 'node:crypto';

/**
 * Sign-in throttling for contractor accounts. Three independent brakes:
 *  - per username: failures in a sliding window (stops online guessing of one account),
 *  - per client IP: failures in a sliding window (stops spraying many usernames),
 *  - per account: consecutive failures lock the account for a cool-down.
 * Unknown usernames are throttled exactly like known ones (no enumeration oracle).
 */

export const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES_PER_USERNAME = 5;
export const MAX_FAILURES_PER_IP = 20;
export const MAX_CONSECUTIVE_FAILURES = 5;
export const ACCOUNT_LOCK_MS = 15 * 60 * 1000;
export const MAX_RESET_REQUESTS_PER_USERNAME = 3;

export function hashThrottleKey(value: string): string {
  return createHash('sha256').update(`pf-contractor:${value.trim().toLowerCase()}`, 'utf8').digest('hex');
}

export interface ThrottleCounts {
  readonly usernameFailures: number;
  readonly ipFailures: number;
}

export function isThrottled(counts: ThrottleCounts): boolean {
  return counts.usernameFailures >= MAX_FAILURES_PER_USERNAME || counts.ipFailures >= MAX_FAILURES_PER_IP;
}

export function isAccountLocked(lockedUntil: Date | null, now: Date = new Date()): boolean {
  return Boolean(lockedUntil && lockedUntil.getTime() > now.getTime());
}

/** Counter + lock after a failed password check. */
export function nextFailureState(
  failedCount: number,
  now: Date = new Date(),
): { failedSignInCount: number; lockedUntil: Date | null } {
  const next = failedCount + 1;
  return {
    failedSignInCount: next,
    lockedUntil: next >= MAX_CONSECUTIVE_FAILURES ? new Date(now.getTime() + ACCOUNT_LOCK_MS) : null,
  };
}

import { createHash } from 'node:crypto';

/**
 * In-memory sign-in throttle for employee PIN login.
 * Unknown usernames consume the same windows as known ones.
 * This does not replace the per-account lock (5 failures, 15 minutes).
 */
export const EMPLOYEE_LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const MAX_EMPLOYEE_USERNAME_FAILURES = 5;
export const MAX_EMPLOYEE_IP_FAILURES = 20;

interface Hit {
  at: number;
}

const usernameHits = new Map<string, Hit[]>();
const ipHits = new Map<string, Hit[]>();

export function hashEmployeeLoginKey(kind: 'user' | 'ip', value: string): string {
  return createHash('sha256')
    .update(`pf-employee:${kind}:${value.trim().toLowerCase()}`, 'utf8')
    .digest('hex');
}

function liveHits(hits: Hit[] | undefined, now: number): Hit[] {
  if (!hits) return [];
  return hits.filter((hit) => now - hit.at < EMPLOYEE_LOGIN_WINDOW_MS);
}

export function employeeLoginIsThrottled(input: {
  username: string;
  ip: string | null;
  now?: number;
}): boolean {
  const now = input.now ?? Date.now();
  const userKey = hashEmployeeLoginKey('user', input.username);
  if (liveHits(usernameHits.get(userKey), now).length >= MAX_EMPLOYEE_USERNAME_FAILURES) {
    return true;
  }
  if (!input.ip) return false;
  const ipKey = hashEmployeeLoginKey('ip', input.ip);
  return liveHits(ipHits.get(ipKey), now).length >= MAX_EMPLOYEE_IP_FAILURES;
}

export function recordEmployeeLoginFailure(input: {
  username: string;
  ip: string | null;
  now?: number;
}): void {
  const now = input.now ?? Date.now();
  const userKey = hashEmployeeLoginKey('user', input.username);
  const nextUser = liveHits(usernameHits.get(userKey), now);
  nextUser.push({ at: now });
  usernameHits.set(userKey, nextUser);

  if (!input.ip) return;
  const ipKey = hashEmployeeLoginKey('ip', input.ip);
  const nextIp = liveHits(ipHits.get(ipKey), now);
  nextIp.push({ at: now });
  ipHits.set(ipKey, nextIp);
}

export function resetEmployeeLoginThrottle(): void {
  usernameHits.clear();
  ipHits.clear();
}

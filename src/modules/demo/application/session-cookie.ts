import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { demoCookieSecret } from './flags';
import { isDemoRoleKey, type DemoRoleKey } from '../domain/demo-org';

export interface DemoSessionCookie {
  readonly sessionId: string;
  readonly profileKey: string;
  readonly roleKey: DemoRoleKey;
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export function sealDemoSessionCookie(payload: DemoSessionCookie): string | null {
  const secret = demoCookieSecret();
  if (!secret) return null;
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function openDemoSessionCookie(value: string | undefined): DemoSessionCookie | null {
  const secret = demoCookieSecret();
  if (!secret || !value) return null;
  const [body, mac] = value.split('.');
  if (!body || !mac) return null;
  const expected = sign(body, secret);
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<DemoSessionCookie>;
    if (!parsed.sessionId || !parsed.profileKey || !isDemoRoleKey(parsed.roleKey)) return null;
    return { sessionId: parsed.sessionId, profileKey: parsed.profileKey, roleKey: parsed.roleKey };
  } catch {
    return null;
  }
}

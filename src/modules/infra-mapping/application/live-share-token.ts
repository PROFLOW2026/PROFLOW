import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { LIVE_SHARE } from '../domain/live-share';

/**
 * Stateless share token carried by the QR / link: it names the project, the organization and the
 * (random, unguessable) LiveKit room, and expires. It is signed with a key derived from the LiveKit
 * API secret, so nobody can forge or alter it. It grants NOTHING by itself: the viewer still has to
 * be signed in and allowed to see the project (checked on the server for every join).
 */

const claimsSchema = z.object({
  v: z.literal(1),
  /** Random session id (the room name is derived from it). */
  s: z.string().regex(/^[a-f0-9]{32}$/),
  o: z.string().uuid(),
  p: z.string().uuid(),
  /** Expiry, unix seconds. */
  exp: z.number().int().positive(),
});

export type LiveShareClaims = z.infer<typeof claimsSchema>;

export type LiveShareTokenCheck =
  | { readonly ok: true; readonly claims: LiveShareClaims }
  | { readonly ok: false; readonly reason: 'invalid' | 'expired' };

const KEY_LABEL = 'projectflow.infra.live-share.v1';

function signingKey(secret: string): Buffer {
  return createHmac('sha256', secret).update(KEY_LABEL).digest();
}

function sign(payload: string, secret: string): Buffer {
  return createHmac('sha256', signingKey(secret)).update(payload).digest();
}

export function newLiveShareSessionId(): string {
  return randomBytes(16).toString('hex');
}

export function liveShareRoomName(sessionId: string): string {
  return `${LIVE_SHARE.roomPrefix}${sessionId}`;
}

export function signLiveShareToken(claims: LiveShareClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  return `${payload}.${sign(payload, secret).toString('base64url')}`;
}

export function verifyLiveShareToken(token: string, secret: string, nowSeconds: number): LiveShareTokenCheck {
  if (typeof token !== 'string' || token.length > 1024) return { ok: false, reason: 'invalid' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'invalid' };
  const [payload, signature] = parts as [string, string];
  const expected = sign(payload, secret);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'invalid' };
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  const parsed = claimsSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: 'invalid' };
  if (parsed.data.exp <= nowSeconds) return { ok: false, reason: 'expired' };
  return { ok: true, claims: parsed.data };
}

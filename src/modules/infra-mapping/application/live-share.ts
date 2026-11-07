import { NotFoundError } from '@/shared/errors';
import { LIVE_SHARE, type LiveShareErrorCode } from '../domain/live-share';
import { authorizeProject, organizationFor } from './access';
import type { InfraActor } from './ports';
import {
  liveShareRoomName,
  signLiveShareToken,
  signLiveShareViewerToken,
  verifyLiveShareToken,
  verifyLiveShareViewerToken,
  type LiveShareClaims,
  type LiveShareViewerClaims,
} from './live-share-token';

/**
 * Live camera sharing use-cases.
 *  - broadcasting needs the right to DOCUMENT on the project (the same right the live camera needs) and is
 *    the only place an account is involved; so is ending the stream;
 *  - watching needs NO account: the public viewer link is a signed, random, short-lived token that names
 *    only the session. It yields nothing but a subscribe-only video token for that one room, one viewer at
 *    a time, and only while the broadcaster is connected. It grants no access to projects, files or data.
 *    The viewer may send small control messages (remote marking) ONLY after the broadcaster approved that for
 *    the active session (`setLiveShareControl`); the broadcaster checks every message again.
 * No data is stored: the room exists only in LiveKit, video-only, with no recording.
 */

export class LiveShareError extends Error {
  readonly code: LiveShareErrorCode;
  constructor(code: LiveShareErrorCode) {
    super(`live-share:${code}`);
    this.name = 'LiveShareError';
    this.code = code;
  }
}

/** The LiveKit side, behind a port so the rules above are testable without a network. */
export interface LiveShareGateway {
  isConfigured(): boolean;
  /** WebSocket URL handed to browsers. */
  serverUrl(): string;
  /** Secret used to sign share tokens (never leaves the server). */
  signingSecret(): string;
  /** Creates the room limited to one host + one viewer (idempotent). */
  createRoom(room: string): Promise<void>;
  issueToken(input: {
    room: string;
    identity: string;
    role: 'host' | 'viewer';
    ttlSeconds: number;
    /** Viewer only: may it send data (remote marking)? Always false unless the broadcaster approved it. */
    controlEnabled?: boolean;
  }): Promise<string>;
  /** Whether the room exists, whether the broadcaster is connected, and the viewers currently in it. */
  roomState(room: string): Promise<{
    exists: boolean;
    hostPresent: boolean;
    viewerIdentities: readonly string[];
    /** The broadcaster approved remote marking for this session (kept in the room, no database). */
    controlEnabled: boolean;
  }>;
  /** Approves / withdraws the viewer's right to send data, for the room and for a viewer already in it. */
  setControl(room: string, enabled: boolean): Promise<void>;
  deleteRoom(room: string): Promise<void>;
}

export interface LiveShareDeps {
  readonly gateway: LiveShareGateway;
  readonly nowSeconds: () => number;
  readonly newSessionId: () => string;
}

/**
 * A viewer's LiveKit identity is derived from the random key its browser keeps, so reopening the link
 * (page refresh) replaces its own earlier connection instead of being refused as "a second viewer".
 */
function viewerIdentity(viewerKey: string): string {
  return `${LIVE_SHARE.viewerIdentityPrefix}${viewerKey}`;
}

function requireConfigured(deps: LiveShareDeps): void {
  if (!deps.gateway.isConfigured()) throw new LiveShareError('not_configured');
}

/** Verifies the signature and expiry only. Callers still authorize the actor. */
export function readLiveShareClaims(shareToken: string, deps: LiveShareDeps): LiveShareClaims {
  requireConfigured(deps);
  const checked = verifyLiveShareToken(shareToken, deps.gateway.signingSecret(), deps.nowSeconds());
  if (!checked.ok) throw new LiveShareError(checked.reason === 'expired' ? 'expired' : 'invalid_link');
  return checked.claims;
}

/** Verifies the public viewer link (signature and expiry only; it carries no identity or project). */
export function readLiveShareViewerClaims(viewerToken: string, deps: LiveShareDeps): LiveShareViewerClaims {
  requireConfigured(deps);
  const checked = verifyLiveShareViewerToken(viewerToken, deps.gateway.signingSecret(), deps.nowSeconds());
  if (!checked.ok) throw new LiveShareError(checked.reason === 'expired' ? 'expired' : 'invalid_link');
  return checked.claims;
}

export interface StartLiveShareResult {
  readonly url: string;
  readonly token: string;
  readonly shareToken: string;
  readonly viewerToken: string;
}

/** Host: creates the room and returns a publish-only (video) token plus the signed share token. */
export async function startLiveShare(
  actor: InfraActor,
  input: { organizationId?: string | null; projectId: string },
  deps: LiveShareDeps,
): Promise<StartLiveShareResult> {
  requireConfigured(deps);
  const organizationId = await organizationFor(actor, input.organizationId);
  const access = await authorizeProject(actor, { organizationId, projectId: input.projectId, need: 'document' });

  const sessionId = deps.newSessionId();
  const room = liveShareRoomName(sessionId);
  const claims: LiveShareClaims = {
    v: 1,
    s: sessionId,
    o: access.organizationId,
    p: access.projectId,
    exp: deps.nowSeconds() + LIVE_SHARE.shareTtlSeconds,
  };
  try {
    await deps.gateway.createRoom(room);
    const token = await deps.gateway.issueToken({
      room,
      identity: LIVE_SHARE.hostIdentity,
      role: 'host',
      ttlSeconds: LIVE_SHARE.shareTtlSeconds,
    });
    return {
      url: deps.gateway.serverUrl(),
      token,
      shareToken: signLiveShareToken(claims, deps.gateway.signingSecret()),
      viewerToken: signLiveShareViewerToken({ v: 1, s: sessionId, exp: claims.exp }, deps.gateway.signingSecret()),
    };
  } catch {
    throw new LiveShareError('unavailable');
  }
}

export interface JoinLiveShareResult {
  readonly url: string;
  readonly token: string;
}

/**
 * Viewer (no account): a subscribe-only video token, for one room, for one viewer at a time, and only while
 * the broadcaster is connected. Once the broadcaster ends the stream the room is gone and nobody can join again.
 */
export async function joinLiveShare(
  input: { viewerToken: string; viewerKey: string },
  deps: LiveShareDeps,
): Promise<JoinLiveShareResult> {
  const claims = readLiveShareViewerClaims(input.viewerToken, deps);

  const room = liveShareRoomName(claims.s);
  try {
    const state = await deps.gateway.roomState(room);
    if (!state.exists || !state.hostPresent) throw new LiveShareError('ended');
    const identity = viewerIdentity(input.viewerKey);
    if (state.viewerIdentities.some((other) => other !== identity)) throw new LiveShareError('viewer_taken');
    const token = await deps.gateway.issueToken({
      room,
      identity,
      role: 'viewer',
      ttlSeconds: Math.min(LIVE_SHARE.viewerTokenTtlSeconds, Math.max(60, claims.exp - deps.nowSeconds())),
      // View-only by default; data (remote marking) only while the broadcaster has approved it for this session.
      controlEnabled: state.controlEnabled,
    });
    return { url: deps.gateway.serverUrl(), token };
  } catch (error) {
    if (error instanceof LiveShareError) throw error;
    throw new LiveShareError('unavailable');
  }
}

/**
 * Host: approves or withdraws remote marking for the ACTIVE session. Needs the same right as starting the
 * stream and the broadcaster's own signed token, so a viewer can never grant it to itself. The grant lives
 * only in the LiveKit room (its metadata and the viewer's permissions): nothing is stored.
 */
export async function setLiveShareControl(
  actor: InfraActor,
  input: { shareToken: string; enabled: boolean },
  deps: LiveShareDeps,
): Promise<void> {
  const claims = readLiveShareClaims(input.shareToken, deps);
  if (actor.kind === 'internal' && actor.context.organizationId !== claims.o) throw new NotFoundError('Organization');
  await authorizeProject(actor, { organizationId: claims.o, projectId: claims.p, need: 'document' });
  const room = liveShareRoomName(claims.s);
  try {
    const state = await deps.gateway.roomState(room);
    if (!state.exists || !state.hostPresent) throw new LiveShareError('ended');
    await deps.gateway.setControl(room, input.enabled);
  } catch (error) {
    if (error instanceof LiveShareError) throw error;
    throw new LiveShareError('unavailable');
  }
}

/** Host: ends the stream (the viewer is disconnected). Needs the same right as starting it. */
export async function endLiveShare(actor: InfraActor, input: { shareToken: string }, deps: LiveShareDeps): Promise<void> {
  const claims = readLiveShareClaims(input.shareToken, deps);
  if (actor.kind === 'internal' && actor.context.organizationId !== claims.o) throw new NotFoundError('Organization');
  await authorizeProject(actor, { organizationId: claims.o, projectId: claims.p, need: 'document' });
  try {
    await deps.gateway.deleteRoom(liveShareRoomName(claims.s));
  } catch {
    // Already gone (host disconnected, room expired): ending is idempotent.
  }
}
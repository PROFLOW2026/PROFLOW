import { NotFoundError } from '@/shared/errors';
import { LIVE_SHARE, type LiveShareErrorCode } from '../domain/live-share';
import { authorizeProject, organizationFor } from './access';
import type { InfraActor } from './ports';
import {
  liveShareRoomName,
  signLiveShareToken,
  verifyLiveShareToken,
  type LiveShareClaims,
} from './live-share-token';

/**
 * Live camera sharing use-cases. Authorization reuses the infrastructure rules:
 *  - broadcasting needs the right to DOCUMENT on the project (the same right the live camera needs);
 *  - watching needs the right to VIEW the project, plus a valid, unexpired share token.
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
  }): Promise<string>;
  /** Identities of the viewers currently in the room. */
  roomState(room: string): Promise<{ exists: boolean; viewerIdentities: readonly string[] }>;
  deleteRoom(room: string): Promise<void>;
}

export interface LiveShareDeps {
  readonly gateway: LiveShareGateway;
  readonly nowSeconds: () => number;
  readonly newSessionId: () => string;
}

/**
 * A viewer's LiveKit identity is derived from who they are, so reopening the link (page refresh)
 * replaces their own earlier connection instead of being refused as "a second viewer".
 */
function viewerIdentity(actor: InfraActor): string {
  const id = actor.kind === 'internal' ? actor.context.userId : actor.context.principalId;
  return `${LIVE_SHARE.viewerIdentityPrefix}${actor.kind === 'internal' ? 'u' : 'x'}-${id}`;
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

export interface StartLiveShareResult {
  readonly url: string;
  readonly token: string;
  readonly shareToken: string;
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
    };
  } catch {
    throw new LiveShareError('unavailable');
  }
}

export interface JoinLiveShareResult {
  readonly url: string;
  readonly token: string;
}

/** Viewer: a subscribe-only token, only for an authorized viewer of the project, only for one viewer. */
export async function joinLiveShare(
  actor: InfraActor,
  input: { shareToken: string },
  deps: LiveShareDeps,
): Promise<JoinLiveShareResult> {
  const claims = readLiveShareClaims(input.shareToken, deps);
  // The viewer's active organization must be the one the stream belongs to.
  if (actor.kind === 'internal' && actor.context.organizationId !== claims.o) throw new NotFoundError('Organization');
  await authorizeProject(actor, { organizationId: claims.o, projectId: claims.p, need: 'view' });

  const room = liveShareRoomName(claims.s);
  try {
    const state = await deps.gateway.roomState(room);
    if (!state.exists) throw new LiveShareError('ended');
    const identity = viewerIdentity(actor);
    if (state.viewerIdentities.some((other) => other !== identity)) throw new LiveShareError('viewer_taken');
    const token = await deps.gateway.issueToken({
      room,
      identity,
      role: 'viewer',
      ttlSeconds: Math.min(LIVE_SHARE.viewerTokenTtlSeconds, Math.max(60, claims.exp - deps.nowSeconds())),
    });
    return { url: deps.gateway.serverUrl(), token };
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
/**
 * Live camera sharing: signed short-lived links, an account-free subscribe-only viewer, one broadcaster + one
 * viewer, no stored data.
 * Pure use-case checks with a fake LiveKit gateway; no network, no database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '@/shared/errors';

const authorizeProject = vi.hoisted(() => vi.fn());
const organizationFor = vi.hoisted(() => vi.fn());
vi.mock('@/modules/infra-mapping/application/access', () => ({ authorizeProject, organizationFor }));

import {
  LiveShareError,
  endLiveShare,
  joinLiveShare,
  startLiveShare,
  type LiveShareDeps,
  type LiveShareGateway,
} from '@/modules/infra-mapping/application/live-share';
import {
  signLiveShareToken,
  signLiveShareViewerToken,
  verifyLiveShareToken,
  verifyLiveShareViewerToken,
} from '@/modules/infra-mapping/application/live-share-token';
import type { InfraActor } from '@/modules/infra-mapping/application/ports';

const ORG = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const SECRET = 'test-secret';
const NOW = 1_800_000_000;

function actor(userId: string, organizationId = ORG): InfraActor {
  return { kind: 'internal', context: { userId, organizationId } } as unknown as InfraActor;
}

function fakeGateway(overrides: Partial<LiveShareGateway> = {}) {
  const issued: { room: string; identity: string; role: string }[] = [];
  const gateway: LiveShareGateway = {
    isConfigured: () => true,
    serverUrl: () => 'wss://example.livekit.test',
    signingSecret: () => SECRET,
    createRoom: vi.fn(async () => undefined),
    issueToken: vi.fn(async (input) => {
      issued.push({ room: input.room, identity: input.identity, role: input.role });
      return `jwt-${input.role}`;
    }),
    roomState: vi.fn(async () => ({ exists: true, hostPresent: true, viewerIdentities: [] })),
    deleteRoom: vi.fn(async () => undefined),
    ...overrides,
  };
  const deps: LiveShareDeps = { gateway, nowSeconds: () => NOW, newSessionId: () => 'a'.repeat(32) };
  return { gateway, deps, issued };
}

beforeEach(() => {
  authorizeProject.mockReset();
  organizationFor.mockReset();
  organizationFor.mockResolvedValue(ORG);
  authorizeProject.mockImplementation(async (_actor, input) => ({ organizationId: input.organizationId, projectId: input.projectId }));
});

describe('share token', () => {
  const claims = { v: 1 as const, s: 'b'.repeat(32), o: ORG, p: PROJECT, exp: NOW + 100 };

  it('round-trips and rejects tampering, a wrong key and expiry', () => {
    const token = signLiveShareToken(claims, SECRET);
    expect(verifyLiveShareToken(token, SECRET, NOW)).toEqual({ ok: true, claims });
    expect(verifyLiveShareToken(token, 'other-secret', NOW)).toEqual({ ok: false, reason: 'invalid' });
    const [payload, signature] = token.split('.') as [string, string];
    const forged = Buffer.from(JSON.stringify({ ...claims, p: ORG }), 'utf8').toString('base64url');
    expect(verifyLiveShareToken(`${forged}.${signature}`, SECRET, NOW).ok).toBe(false);
    expect(verifyLiveShareToken(`${payload}x.${signature}`, SECRET, NOW).ok).toBe(false);
    expect(verifyLiveShareToken(token, SECRET, NOW + 100)).toEqual({ ok: false, reason: 'expired' });
    expect(verifyLiveShareToken('garbage', SECRET, NOW).ok).toBe(false);
  });
});

describe('start (broadcaster)', () => {
  it('needs the right to document, creates a two-person room and returns a host token + a broadcaster token + a public viewer link token', async () => {
    const { gateway, deps, issued } = fakeGateway();
    const result = await startLiveShare(actor('u1'), { projectId: PROJECT }, deps);
    expect(authorizeProject).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ projectId: PROJECT, need: 'document' }));
    expect(gateway.createRoom).toHaveBeenCalledWith(`pf-live-${'a'.repeat(32)}`);
    expect(issued[0]).toMatchObject({ role: 'host', identity: 'host' });
    expect(result.token).toBe('jwt-host');
    expect(result.url).toBe('wss://example.livekit.test');
    const verified = verifyLiveShareToken(result.shareToken, SECRET, NOW);
    expect(verified.ok && verified.claims.p).toBe(PROJECT);
    const viewer = verifyLiveShareViewerToken(result.viewerToken, SECRET, NOW);
    expect(viewer.ok && viewer.claims.s).toBe('a'.repeat(32));
    expect(viewer.ok && viewer.claims.exp).toBe(verified.ok ? verified.claims.exp : -1);
  });

  it('refuses without the right, and when LiveKit is not configured', async () => {
    authorizeProject.mockRejectedValueOnce(new AuthorizationError('project:view'));
    await expect(startLiveShare(actor('u1'), { projectId: PROJECT }, fakeGateway().deps)).rejects.toBeInstanceOf(AuthorizationError);
    const off = fakeGateway({ isConfigured: () => false });
    await expect(startLiveShare(actor('u1'), { projectId: PROJECT }, off.deps)).rejects.toMatchObject({ code: 'not_configured' });
  });
});

describe('join (viewer, no account)', () => {
  const KEY_A = 'a1'.repeat(16);
  const KEY_B = 'b2'.repeat(16);

  async function link() {
    const host = fakeGateway();
    return (await startLiveShare(actor('host-user'), { projectId: PROJECT }, host.deps)).viewerToken;
  }
  const live = { exists: true, hostPresent: true, viewerIdentities: [] as string[] };

  it('needs no actor or project rights and gives a subscribe-only token for the one room', async () => {
    const viewerToken = await link();
    authorizeProject.mockClear();
    const { deps, issued } = fakeGateway();
    const joined = await joinLiveShare({ viewerToken, viewerKey: KEY_A }, deps);
    expect(joined).toMatchObject({ token: 'jwt-viewer', url: 'wss://example.livekit.test' });
    expect(issued[0]).toEqual({ room: `pf-live-${'a'.repeat(32)}`, identity: `viewer-${KEY_A}`, role: 'viewer' });
    expect(authorizeProject).not.toHaveBeenCalled();
  });

  it('caps the viewer token to a few minutes', async () => {
    const viewerToken = await link();
    const { gateway, deps } = fakeGateway();
    await joinLiveShare({ viewerToken, viewerKey: KEY_A }, deps);
    expect(gateway.issueToken).toHaveBeenCalledWith(expect.objectContaining({ role: 'viewer', ttlSeconds: 300 }));
  });

  it('the public link reveals no organization or project and is not the broadcaster token', async () => {
    const host = fakeGateway();
    const started = await startLiveShare(actor('u1'), { projectId: PROJECT }, host.deps);
    const payload = Buffer.from(started.viewerToken.split('.')[0] as string, 'base64url').toString('utf8');
    expect(payload).not.toContain(ORG);
    expect(payload).not.toContain(PROJECT);
    expect(started.viewerToken).not.toBe(started.shareToken);
    // The two kinds of token are not interchangeable (different keys and claims).
    expect(verifyLiveShareToken(started.viewerToken, SECRET, NOW).ok).toBe(false);
    expect(verifyLiveShareViewerToken(started.shareToken, SECRET, NOW).ok).toBe(false);
    const { deps } = fakeGateway();
    await expect(joinLiveShare({ viewerToken: started.shareToken, viewerKey: KEY_A }, deps)).rejects.toMatchObject({ code: 'invalid_link' });
    await expect(endLiveShare(actor('u1'), { shareToken: started.viewerToken }, host.deps)).rejects.toMatchObject({ code: 'invalid_link' });
  });

  it('refuses a forged link, a link signed with another key, garbage and an expired link', async () => {
    const viewerToken = await link();
    const { deps } = fakeGateway();
    await expect(joinLiveShare({ viewerToken: `${viewerToken}x`, viewerKey: KEY_A }, deps)).rejects.toMatchObject({ code: 'invalid_link' });
    const other = signLiveShareViewerToken({ v: 1, s: 'c'.repeat(32), exp: NOW + 100 }, 'other-secret');
    await expect(joinLiveShare({ viewerToken: other, viewerKey: KEY_A }, deps)).rejects.toMatchObject({ code: 'invalid_link' });
    await expect(joinLiveShare({ viewerToken: 'garbage', viewerKey: KEY_A }, deps)).rejects.toMatchObject({ code: 'invalid_link' });
    await expect(
      joinLiveShare({ viewerToken, viewerKey: KEY_A }, { ...deps, nowSeconds: () => NOW + 60 * 60 }),
    ).rejects.toMatchObject({ code: 'expired' });
  });

  it('does not touch LiveKit for an invalid link', async () => {
    const { gateway, deps } = fakeGateway();
    await joinLiveShare({ viewerToken: 'garbage', viewerKey: KEY_A }, deps).catch(() => undefined);
    expect(gateway.roomState).not.toHaveBeenCalled();
    expect(gateway.issueToken).not.toHaveBeenCalled();
  });

  it('allows exactly one viewer, but lets the same device reconnect', async () => {
    const viewerToken = await link();
    const taken = fakeGateway({ roomState: async () => ({ ...live, viewerIdentities: [`viewer-${KEY_B}`] }) });
    await expect(joinLiveShare({ viewerToken, viewerKey: KEY_A }, taken.deps)).rejects.toMatchObject({ code: 'viewer_taken' });
    const same = fakeGateway({ roomState: async () => ({ ...live, viewerIdentities: [`viewer-${KEY_A}`] }) });
    await expect(joinLiveShare({ viewerToken, viewerKey: KEY_A }, same.deps)).resolves.toMatchObject({ token: 'jwt-viewer' });
  });

  it('cannot join once the broadcast has ended (room gone) or while the broadcaster is not connected', async () => {
    const viewerToken = await link();
    const gone = fakeGateway({ roomState: async () => ({ exists: false, hostPresent: false, viewerIdentities: [] }) });
    const error = await joinLiveShare({ viewerToken, viewerKey: KEY_A }, gone.deps).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LiveShareError);
    expect((error as LiveShareError).code).toBe('ended');
    const hostless = fakeGateway({ roomState: async () => ({ exists: true, hostPresent: false, viewerIdentities: [] }) });
    await expect(joinLiveShare({ viewerToken, viewerKey: KEY_A }, hostless.deps)).rejects.toMatchObject({ code: 'ended' });
    expect(hostless.gateway.issueToken).not.toHaveBeenCalled();
  });

  it('reports not configured without leaking anything', async () => {
    const off = fakeGateway({ isConfigured: () => false });
    await expect(joinLiveShare({ viewerToken: 'x', viewerKey: KEY_A }, off.deps)).rejects.toMatchObject({ code: 'not_configured' });
  });
});
describe('end', () => {
  it('closes the room (disconnecting the viewer) for someone allowed to broadcast; idempotent if already gone', async () => {
    const host = fakeGateway();
    const { shareToken } = await startLiveShare(actor('u1'), { projectId: PROJECT }, host.deps);
    await endLiveShare(actor('u1'), { shareToken }, host.deps);
    expect(host.gateway.deleteRoom).toHaveBeenCalledWith(`pf-live-${'a'.repeat(32)}`);
    const gone = fakeGateway({ deleteRoom: async () => Promise.reject(new Error('not found')) });
    await expect(endLiveShare(actor('u1'), { shareToken }, gone.deps)).resolves.toBeUndefined();
  });
});

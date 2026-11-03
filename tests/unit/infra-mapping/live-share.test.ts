/**
 * Live camera sharing: signed share link, one broadcaster + one viewer, no stored data.
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
import { signLiveShareToken, verifyLiveShareToken } from '@/modules/infra-mapping/application/live-share-token';
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
    roomState: vi.fn(async () => ({ exists: true, viewerIdentities: [] })),
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
  it('needs the right to document, creates a two-person room and returns a host token + signed link token', async () => {
    const { gateway, deps, issued } = fakeGateway();
    const result = await startLiveShare(actor('u1'), { projectId: PROJECT }, deps);
    expect(authorizeProject).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ projectId: PROJECT, need: 'document' }));
    expect(gateway.createRoom).toHaveBeenCalledWith(`pf-live-${'a'.repeat(32)}`);
    expect(issued[0]).toMatchObject({ role: 'host', identity: 'host' });
    expect(result.token).toBe('jwt-host');
    expect(result.url).toBe('wss://example.livekit.test');
    const verified = verifyLiveShareToken(result.shareToken, SECRET, NOW);
    expect(verified.ok && verified.claims.p).toBe(PROJECT);
  });

  it('refuses without the right, and when LiveKit is not configured', async () => {
    authorizeProject.mockRejectedValueOnce(new AuthorizationError('project:view'));
    await expect(startLiveShare(actor('u1'), { projectId: PROJECT }, fakeGateway().deps)).rejects.toBeInstanceOf(AuthorizationError);
    const off = fakeGateway({ isConfigured: () => false });
    await expect(startLiveShare(actor('u1'), { projectId: PROJECT }, off.deps)).rejects.toMatchObject({ code: 'not_configured' });
  });
});

describe('join (viewer)', () => {
  async function link() {
    const host = fakeGateway();
    return (await startLiveShare(actor('host-user'), { projectId: PROJECT }, host.deps)).shareToken;
  }

  it('gives a subscribe-only token to an authorized member of the same organization', async () => {
    const shareToken = await link();
    const { deps, issued } = fakeGateway();
    const joined = await joinLiveShare(actor('viewer-user'), { shareToken }, deps);
    expect(joined.token).toBe('jwt-viewer');
    expect(issued[0]).toMatchObject({ role: 'viewer', identity: 'viewer-u-viewer-user' });
    expect(authorizeProject).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ need: 'view', projectId: PROJECT }));
  });

  it('refuses a forged link, an expired link, another organization and a member without access', async () => {
    const shareToken = await link();
    const { deps } = fakeGateway();
    await expect(joinLiveShare(actor('v'), { shareToken: `${shareToken}x` }, deps)).rejects.toMatchObject({ code: 'invalid_link' });
    await expect(joinLiveShare(actor('v'), { shareToken }, { ...deps, nowSeconds: () => NOW + 3 * 60 * 60 })).rejects.toMatchObject({
      code: 'expired',
    });
    await expect(joinLiveShare(actor('v', '33333333-3333-4333-8333-333333333333'), { shareToken }, deps)).rejects.toThrow();
    authorizeProject.mockRejectedValueOnce(new AuthorizationError('project:view'));
    await expect(joinLiveShare(actor('v'), { shareToken }, deps)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('allows exactly one viewer, but lets the same person reconnect', async () => {
    const shareToken = await link();
    const taken = fakeGateway({ roomState: async () => ({ exists: true, viewerIdentities: ['viewer-u-someone-else'] }) });
    await expect(joinLiveShare(actor('viewer-user'), { shareToken }, taken.deps)).rejects.toMatchObject({ code: 'viewer_taken' });
    const same = fakeGateway({ roomState: async () => ({ exists: true, viewerIdentities: ['viewer-u-viewer-user'] }) });
    await expect(joinLiveShare(actor('viewer-user'), { shareToken }, same.deps)).resolves.toMatchObject({ token: 'jwt-viewer' });
  });

  it('reports an ended broadcast', async () => {
    const shareToken = await link();
    const gone = fakeGateway({ roomState: async () => ({ exists: false, viewerIdentities: [] }) });
    const error = await joinLiveShare(actor('v'), { shareToken }, gone.deps).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LiveShareError);
    expect((error as LiveShareError).code).toBe('ended');
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

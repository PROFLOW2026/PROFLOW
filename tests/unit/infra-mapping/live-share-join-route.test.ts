/**
 * The public join route for the account-free viewer: validation, no-store, error mapping, no data leaks.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const joinLiveShare = vi.hoisted(() => vi.fn());
vi.mock('@/modules/infra-mapping/live-share-server', () => ({ liveShareDeps: {} }));
vi.mock('@/modules/infra-mapping/application/live-share', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/modules/infra-mapping/application/live-share');
  return { ...actual, joinLiveShare };
});

import { POST } from '@/app/api/live-share/join/route';
import { LiveShareError } from '@/modules/infra-mapping/application/live-share';

const KEY = 'ab'.repeat(16);

function post(body: unknown, raw?: string): Request {
  return new Request('https://app.example.com/api/live-share/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });
}

beforeEach(() => joinLiveShare.mockReset());

describe('POST /api/live-share/join', () => {
  it('returns only the url and the subscribe-only token, never cached', async () => {
    joinLiveShare.mockResolvedValue({ url: 'wss://lk.test', token: 'jwt-viewer', secret: 'must-not-leak' });
    const response = await POST(post({ viewerToken: 'tok-1', viewerKey: KEY }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ ok: true, data: { url: 'wss://lk.test', token: 'jwt-viewer' } });
    expect(joinLiveShare).toHaveBeenCalledWith({ viewerToken: 'tok-1', viewerKey: KEY }, expect.anything());
  });

  it('rejects malformed input before touching the service', async () => {
    for (const bad of [
      post({}),
      post({ viewerToken: 'x', viewerKey: 'short' }),
      post({ viewerToken: '', viewerKey: KEY }),
      post(null, 'not json'),
      post({ viewerToken: 'x'.repeat(600), viewerKey: KEY }),
      post(null, 'x'.repeat(5000)),
    ]) {
      const response = await POST(bad);
      expect(response.status).toBe(400);
    }
    expect(joinLiveShare).not.toHaveBeenCalled();
  });

  it('maps join refusals to clean statuses and Hebrew messages', async () => {
    const cases: [ConstructorParameters<typeof LiveShareError>[0], number][] = [
      ['invalid_link', 400],
      ['expired', 410],
      ['ended', 410],
      ['viewer_taken', 409],
      ['not_configured', 503],
    ];
    for (const [code, status] of cases) {
      joinLiveShare.mockRejectedValueOnce(new LiveShareError(code));
      const response = await POST(post({ viewerToken: `tok-${code}`, viewerKey: KEY }));
      expect(response.status).toBe(status);
      const body = (await response.json()) as { ok: boolean; code: string; error: string };
      expect(body).toMatchObject({ ok: false, code });
      expect(body.error.length).toBeGreaterThan(0);
    }
  });

  it('hides unexpected errors behind a generic message', async () => {
    joinLiveShare.mockRejectedValueOnce(new Error('LIVEKIT_API_SECRET=very-secret'));
    const response = await POST(post({ viewerToken: 'tok-boom', viewerKey: KEY }));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('very-secret');
  });
});

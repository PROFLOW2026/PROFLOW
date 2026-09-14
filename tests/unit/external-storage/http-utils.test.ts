import { describe, expect, it, vi, afterEach } from 'vitest';
import { providerJson } from '@/modules/external-storage/providers/http-utils';

describe('providerJson Content-Type', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses application/json for JSON string bodies', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = init.headers as Headers;
      expect(headers.get('Content-Type')).toBe('application/json');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await providerJson('/test', {
      method: 'POST',
      body: JSON.stringify({ name: 'ProjectFlow', folder: {} }),
    });
  });

  it('uses form encoding for OAuth-style string bodies', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = init.headers as Headers;
      expect(headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
      return new Response(JSON.stringify({ access_token: 'x' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await providerJson('/token', {
      method: 'POST',
      body: 'client_id=a&grant_type=authorization_code',
    });
  });
});

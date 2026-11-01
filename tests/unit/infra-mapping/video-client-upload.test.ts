/**
 * Browser-side chunked upload: chunking, retry of a failed chunk, resume after a failure and
 * resync to the offset the server confirms. fetch is mocked; nothing leaves the process.
 */
import { describe, expect, it, vi } from 'vitest';
import { INFRA_VIDEO_CHUNK_BYTES } from '@/modules/infra-mapping/domain/video';
import { uploadVideoInChunks, type VideoTransferState } from '@/modules/infra-mapping/ui/infra-video-upload';

const TOTAL = INFRA_VIDEO_CHUNK_BYTES * 2 + 1000; // three requests
const file = new Blob([new Uint8Array(TOTAL)], { type: 'video/mp4' });
const noSleep = () => Promise.resolve();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A fake server that confirms what it received, like the relay route does. */
function server(options: { failChunkOnce?: number; status?: number } = {}) {
  const seen: Array<{ offset: number; length: number; session: string | null; total: number }> = [];
  let failed = false;
  const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const offset = Number(headers.get('x-upload-offset'));
    const body = init?.body as Blob;
    if (options.failChunkOnce === offset && !failed) {
      failed = true;
      return json({ error: 'x' }, options.status ?? 503);
    }
    seen.push({ offset, length: body.size, session: headers.get('x-upload-session'), total: Number(headers.get('x-upload-total')) });
    const next = offset + body.size;
    return next >= TOTAL
      ? json({ done: true, nextOffset: TOTAL, session: null })
      : json({ done: false, nextOffset: next, session: `s${next}` });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, seen };
}

describe('uploadVideoInChunks', () => {
  it('never sends the whole file in one request and carries the sealed session forward', async () => {
    const { fetchImpl, seen } = server();
    const state: VideoTransferState = { offset: 0, session: null };
    const progress: number[] = [];
    const result = await uploadVideoInChunks({ uploadUrl: '/api/infra/video-upload/e1', file, state, fetchImpl, sleep: noSleep, onProgress: (f) => progress.push(f) });
    expect(result).toEqual({ ok: true });
    expect(seen.map((s) => s.length)).toEqual([INFRA_VIDEO_CHUNK_BYTES, INFRA_VIDEO_CHUNK_BYTES, 1000]);
    expect(Math.max(...seen.map((s) => s.length))).toBeLessThan(4 * 1024 * 1024);
    expect(seen.map((s) => s.session)).toEqual([null, `s${INFRA_VIDEO_CHUNK_BYTES}`, `s${INFRA_VIDEO_CHUNK_BYTES * 2}`]);
    expect(seen.every((s) => s.total === TOTAL)).toBe(true);
    expect(progress.at(-1)).toBe(1);
  });

  it('retries a chunk that hit a server hiccup without losing earlier chunks', async () => {
    const { fetchImpl, seen } = server({ failChunkOnce: INFRA_VIDEO_CHUNK_BYTES });
    const state: VideoTransferState = { offset: 0, session: null };
    const result = await uploadVideoInChunks({ uploadUrl: '/u', file, state, fetchImpl, sleep: noSleep });
    expect(result).toEqual({ ok: true });
    expect(seen.map((s) => s.offset)).toEqual([0, INFRA_VIDEO_CHUNK_BYTES, INFRA_VIDEO_CHUNK_BYTES * 2]);
  });

  it('after the retries are exhausted it fails but keeps the state so a manual retry resumes', async () => {
    const calls: number[] = [];
    let online = false;
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const offset = Number(headers.get('x-upload-offset'));
      if (offset > 0 && !online) throw new TypeError('offline');
      calls.push(offset);
      const next = offset + (init!.body as Blob).size;
      return next >= TOTAL ? json({ done: true, nextOffset: TOTAL, session: null }) : json({ done: false, nextOffset: next, session: `s${next}` });
    }) as unknown as typeof fetch;

    const state: VideoTransferState = { offset: 0, session: null };
    const first = await uploadVideoInChunks({ uploadUrl: '/u', file, state, fetchImpl, sleep: noSleep });
    expect(first.ok).toBe(false);
    expect(state.offset).toBe(INFRA_VIDEO_CHUNK_BYTES); // first chunk is safe in the cloud
    expect(state.session).toBe(`s${INFRA_VIDEO_CHUNK_BYTES}`);

    online = true;
    const second = await uploadVideoInChunks({ uploadUrl: '/u', file, state, fetchImpl, sleep: noSleep });
    expect(second).toEqual({ ok: true });
    expect(calls).toEqual([0, INFRA_VIDEO_CHUNK_BYTES, INFRA_VIDEO_CHUNK_BYTES * 2]); // chunk 0 was NOT sent again
  });

  it('follows the offset the server confirms (a chunk that had already landed is not repeated)', async () => {
    const offsets: number[] = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const offset = Number(new Headers(init?.headers).get('x-upload-offset'));
      offsets.push(offset);
      if (offset === 0) return json({ done: false, nextOffset: INFRA_VIDEO_CHUNK_BYTES * 2, session: 'ahead' });
      return json({ done: true, nextOffset: TOTAL, session: null });
    }) as unknown as typeof fetch;
    const result = await uploadVideoInChunks({ uploadUrl: '/u', file, state: { offset: 0, session: null }, fetchImpl, sleep: noSleep });
    expect(result.ok).toBe(true);
    expect(offsets).toEqual([0, INFRA_VIDEO_CHUNK_BYTES * 2]);
  });

  it('restarts once when the sealed session is rejected, then reports a permanent error', async () => {
    const sessions: Array<string | null> = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      sessions.push(headers.get('x-upload-session'));
      if (headers.get('x-upload-session')) return json({ error: 'infraMapping.errors.videoSession' }, 422);
      const offset = Number(headers.get('x-upload-offset'));
      const next = offset + (init!.body as Blob).size;
      return next >= TOTAL ? json({ done: true, nextOffset: TOTAL, session: null }) : json({ done: false, nextOffset: next, session: `s${next}` });
    }) as unknown as typeof fetch;
    const state: VideoTransferState = { offset: INFRA_VIDEO_CHUNK_BYTES, session: 'stale' };
    const result = await uploadVideoInChunks({ uploadUrl: '/u', file, state, fetchImpl, sleep: noSleep });
    // restarted from 0 with no session, then the fresh session was rejected again -> give up
    expect(sessions[0]).toBe('stale');
    expect(sessions[1]).toBeNull();
    expect(result.ok).toBe(false);
  });

  it('shows the Hebrew message for a server error key and does not retry a 4xx', async () => {
    const fetchImpl = vi.fn(async () => json({ error: 'infraMapping.errors.videoProviderLimit' }, 422)) as unknown as typeof fetch;
    const result = await uploadVideoInChunks({ uploadUrl: '/u', file, state: { offset: 0, session: null }, fetchImpl, sleep: noSleep });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('4MB');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

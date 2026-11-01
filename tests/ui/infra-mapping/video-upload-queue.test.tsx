// @vitest-environment jsdom
/**
 * The approve-then-upload queue with a recorded video: nothing is registered or uploaded before the
 * user approves; cancelling drops it; an approved video is registered in the chosen location and sent
 * in chunks (never as one POST); a failed chunk resumes from the confirmed offset on retry.
 */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({
  beginCaptureAction: vi.fn(),
  beginVideoCaptureAction: vi.fn(),
}));
vi.mock('@/modules/infra-mapping/actions', () => actions);

import { useInfraUploads } from '@/modules/infra-mapping/ui/use-infra-uploads';
import { INFRA_VIDEO_CHUNK_BYTES } from '@/modules/infra-mapping/domain/video';

const PROJECT = '33333333-3333-4333-8333-333333333333';
const LOCATION = '44444444-4444-4444-8444-444444444444';
const ORG = '11111111-1111-4111-8111-111111111111';

const context = { viewer: 'internal' as const, projectId: PROJECT, organizationId: ORG, taskId: null };

function videoFile(bytes: number) {
  const data = new Uint8Array(bytes);
  data.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70], 0);
  return new File([data], 'video-1.mp4', { type: 'video/mp4' });
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  actions.beginCaptureAction.mockReset();
  actions.beginVideoCaptureAction.mockReset();
  actions.beginVideoCaptureAction.mockResolvedValue({
    ok: true,
    data: {
      captureId: 'c1',
      evidenceId: 'e1',
      uploadUrl: '/api/infra/video-upload/e1',
      alreadyUploaded: false,
      chunkBytes: INFRA_VIDEO_CHUNK_BYTES,
      singleMaxBytes: 4 * 1024 * 1024,
    },
  });
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:v'), revokeObjectURL: vi.fn() }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('video in the upload queue', () => {
  it('registers and uploads nothing before approval, and a cancelled video is never uploaded', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useInfraUploads(context));
    let id = '';
    act(() => {
      id = result.current.addVideo(videoFile(2048), { locationId: LOCATION, source: 'camera', durationMs: 12_000 });
    });
    expect(result.current.items[0]?.status).toBe('pending_approval');
    expect(result.current.videos[id]).toEqual({ durationMs: 12_000 });
    await act(async () => {
      await Promise.resolve();
    });
    expect(actions.beginVideoCaptureAction).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => result.current.discard(id));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.items).toHaveLength(0);
    expect(actions.beginVideoCaptureAction).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an approved video is registered in the chosen location (not as a photo) and uploaded in chunks', async () => {
    const total = INFRA_VIDEO_CHUNK_BYTES * 2 + 100;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ done: false, nextOffset: INFRA_VIDEO_CHUNK_BYTES, session: 's1' }))
      .mockResolvedValueOnce(json({ done: false, nextOffset: INFRA_VIDEO_CHUNK_BYTES * 2, session: 's2' }))
      .mockResolvedValueOnce(json({ done: true, nextOffset: total, session: null }));
    vi.stubGlobal('fetch', fetchMock);
    const onUploaded = vi.fn();
    const { result } = renderHook(() => useInfraUploads({ ...context, onUploaded }));
    let id = '';
    act(() => {
      id = result.current.addVideo(videoFile(total), { locationId: LOCATION, source: 'camera', durationMs: 29_000 });
    });
    act(() => result.current.approve(id));
    await waitFor(() => expect(result.current.items[0]?.status).toBe('uploaded'));

    expect(actions.beginCaptureAction).not.toHaveBeenCalled();
    expect(actions.beginVideoCaptureAction).toHaveBeenCalledTimes(1);
    expect(actions.beginVideoCaptureAction.mock.calls[0]![1]).toMatchObject({
      projectId: PROJECT,
      locationId: LOCATION,
      clientCaptureId: id,
      durationMs: 29_000,
      file: { mimeType: 'video/mp4', sizeBytes: total },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3); // chunks, never one POST of the whole file
    const sizes = fetchMock.mock.calls.map((call) => (call[1].body as Blob).size);
    expect(sizes).toEqual([INFRA_VIDEO_CHUNK_BYTES, INFRA_VIDEO_CHUNK_BYTES, 100]);
    expect(Math.max(...sizes)).toBeLessThan(4.5 * 1024 * 1024);
    expect(onUploaded).toHaveBeenCalledWith('c1');
  });

  it('a retry after a failed chunk resumes from the confirmed offset instead of starting over', async () => {
    const total = INFRA_VIDEO_CHUNK_BYTES * 2;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ done: false, nextOffset: INFRA_VIDEO_CHUNK_BYTES, session: 's1' }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(json({ done: true, nextOffset: total, session: null }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useInfraUploads(context));
    let id = '';
    act(() => {
      id = result.current.addVideo(videoFile(total), { locationId: LOCATION, source: 'gallery', durationMs: 20_000 });
    });
    act(() => result.current.approve(id));
    // three attempts with a short real back-off (0.8 s + 1.6 s) before the chunk is reported failed
    await waitFor(() => expect(result.current.items[0]?.status).toBe('failed'), { timeout: 8000 });

    act(() => result.current.retry(id));
    await waitFor(() => expect(result.current.items[0]?.status).toBe('uploaded'));
    const last = fetchMock.mock.calls.at(-1)![1] as { headers: Record<string, string> };
    expect(last.headers['x-upload-offset']).toBe(String(INFRA_VIDEO_CHUNK_BYTES));
    expect(last.headers['x-upload-session']).toBe('s1');
  }, 20_000);
});

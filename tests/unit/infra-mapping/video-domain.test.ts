/**
 * Short infrastructure videos - pure rules: limits, file naming, chunk planning, recorder format
 * choice and frame extraction. No I/O.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  INFRA_VIDEO_CHUNK_BYTES,
  INFRA_VIDEO_MAX_BYTES,
  INFRA_VIDEO_MAX_MS,
  INFRA_VIDEO_SINGLE_MAX_BYTES,
  checkInfraVideo,
  clampVideoDurationMs,
  formatVideoDuration,
  infraVideoFileName,
  isValidChunkRequest,
  needsChunking,
  nextChunk,
  normalizeVideoMime,
  parseVideoDurationMs,
  pickRecorderMimeType,
} from '@/modules/infra-mapping/domain/video';
import { extractVideoFrame, frameSize, type FrameCanvas } from '@/modules/infra-mapping/ui/infra-video-frame';

describe('recorder format', () => {
  it('prefers MP4, then WebM, and never assumes a codec', () => {
    expect(pickRecorderMimeType(() => true)).toBe('video/mp4;codecs=avc1.42E01E');
    expect(pickRecorderMimeType((type) => type.startsWith('video/webm'))).toBe('video/webm;codecs=vp9');
    expect(pickRecorderMimeType((type) => type === 'video/webm')).toBe('video/webm');
    expect(pickRecorderMimeType(() => false)).toBeNull();
    expect(
      pickRecorderMimeType(() => {
        throw new Error('boom');
      }),
    ).toBeNull();
  });

  it('normalizes MIME parameters, aliases and extension-only types', () => {
    expect(normalizeVideoMime('video/webm;codecs=vp9')).toBe('video/webm');
    expect(normalizeVideoMime('video/x-m4v')).toBe('video/mp4');
    expect(normalizeVideoMime('', 'IMG_0001.MOV')).toBe('video/quicktime');
    expect(normalizeVideoMime('application/octet-stream', 'a.mp4')).toBe('video/mp4');
    expect(normalizeVideoMime('image/jpeg', 'a.jpg')).toBeNull();
    expect(normalizeVideoMime('video/avi')).toBeNull();
  });
});

describe('video limits', () => {
  const ok = { mimeType: 'video/mp4', sizeBytes: 5_000_000, durationMs: 12_000 };

  it('accepts a normal recording and a clip stopped right at 30 s', () => {
    expect(checkInfraVideo(ok)).toEqual({ ok: true, mimeType: 'video/mp4' });
    expect(checkInfraVideo({ ...ok, durationMs: INFRA_VIDEO_MAX_MS }).ok).toBe(true);
    expect(checkInfraVideo({ ...ok, durationMs: 300 }).ok).toBe(true); // no minimum length
  });

  it('rejects wrong type, empty, oversized, over 30 s and unreadable duration', () => {
    expect(checkInfraVideo({ ...ok, mimeType: 'image/png' })).toEqual({ ok: false, reason: 'type' });
    expect(checkInfraVideo({ ...ok, sizeBytes: 0 })).toEqual({ ok: false, reason: 'empty' });
    expect(checkInfraVideo({ ...ok, sizeBytes: INFRA_VIDEO_MAX_BYTES + 1 })).toEqual({ ok: false, reason: 'too_large' });
    expect(checkInfraVideo({ ...ok, durationMs: 31_500 })).toEqual({ ok: false, reason: 'too_long' });
    expect(checkInfraVideo({ ...ok, durationMs: null })).toEqual({ ok: false, reason: 'unknown_duration' });
    expect(checkInfraVideo({ ...ok, durationMs: Number.POSITIVE_INFINITY })).toEqual({ ok: false, reason: 'unknown_duration' });
  });

  it('caps a timer overshoot to 30 s', () => {
    expect(clampVideoDurationMs(30_240)).toBe(30_000);
    expect(clampVideoDurationMs(-5)).toBe(0);
    expect(formatVideoDuration(7_400)).toBe('0:07');
    expect(formatVideoDuration(30_000)).toBe('0:30');
  });
});

describe('video file name', () => {
  it('encodes the duration so the gallery can show it, and round-trips', () => {
    const name = infraVideoFileName({
      capturedAt: new Date('2026-11-01T10:20:30.456Z'),
      clientCaptureId: '12345678-aaaa-4bbb-8ccc-123456789abc',
      durationMs: 17_400,
      mimeType: 'video/webm',
    });
    expect(name).toBe('infra-video-20261101T102030Z-12345678-17s.webm');
    expect(parseVideoDurationMs(name)).toBe(17_000);
    expect(parseVideoDurationMs('infra-20261101T102030Z-12345678.jpg')).toBeNull();
    expect(parseVideoDurationMs('holiday-2024s.mp4')).toBeNull();
  });
});

describe('chunk planning', () => {
  it('sends a small video in one request and a larger one in aligned chunks', () => {
    expect(needsChunking(INFRA_VIDEO_SINGLE_MAX_BYTES)).toBe(false);
    expect(needsChunking(INFRA_VIDEO_SINGLE_MAX_BYTES + 1)).toBe(true);
    expect(nextChunk(3_000_000, 0)).toEqual({ offset: 0, length: 3_000_000, final: true });

    const total = 6_000_000;
    const first = nextChunk(total, 0)!;
    expect(first).toEqual({ offset: 0, length: INFRA_VIDEO_CHUNK_BYTES, final: false });
    expect(first.length % (256 * 1024)).toBe(0);
    expect(first.length % (320 * 1024)).toBe(0);
    const second = nextChunk(total, INFRA_VIDEO_CHUNK_BYTES)!;
    expect(second.final).toBe(false);
    const last = nextChunk(total, INFRA_VIDEO_CHUNK_BYTES * 2)!;
    expect(last).toEqual({ offset: INFRA_VIDEO_CHUNK_BYTES * 2, length: total - INFRA_VIDEO_CHUNK_BYTES * 2, final: true });
    expect(nextChunk(total, total)).toBeNull();
  });

  it('the server validates exactly what the client plans', () => {
    const total = 7_000_000;
    let offset = 0;
    for (let plan = nextChunk(total, offset); plan; plan = nextChunk(total, offset)) {
      expect(isValidChunkRequest({ totalBytes: total, offset: plan.offset, length: plan.length })).toBe(true);
      offset += plan.length;
    }
    expect(offset).toBe(total);
    // wrong sizes / overruns / split small files are rejected
    expect(isValidChunkRequest({ totalBytes: total, offset: 0, length: 1000 })).toBe(false);
    expect(isValidChunkRequest({ totalBytes: total, offset: total - 10, length: 100 })).toBe(false);
    expect(isValidChunkRequest({ totalBytes: 3_000_000, offset: 0, length: 1_000_000 })).toBe(false);
    expect(isValidChunkRequest({ totalBytes: 3_000_000, offset: 1, length: 2_999_999 })).toBe(false);
    expect(isValidChunkRequest({ totalBytes: 3_000_000, offset: 0, length: 3_000_000 })).toBe(true);
  });
});

describe('frame extraction (for the existing locate flows)', () => {
  function fakeCanvas(blob: Blob | null = new Blob([new Uint8Array([1, 2, 3])])) {
    const drawImage = vi.fn();
    const canvas: FrameCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (callback) => callback(blob),
    };
    return { canvas, drawImage };
  }

  it('returns a JPEG file of the current frame at the native size', async () => {
    const { canvas, drawImage } = fakeCanvas();
    const file = await extractVideoFrame({ videoWidth: 1280, videoHeight: 720, readyState: 4, currentTime: 3.25 }, () => canvas);
    expect(file).toBeInstanceOf(File);
    expect(file!.type).toBe('image/jpeg');
    expect(file!.name).toBe('video-frame-3250ms.jpg');
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);
    expect(drawImage).toHaveBeenCalledOnce();
  });

  it('returns nothing when no frame is decoded yet, and shrinks very large videos', async () => {
    const { canvas } = fakeCanvas();
    expect(await extractVideoFrame({ videoWidth: 0, videoHeight: 0, readyState: 0, currentTime: 0 }, () => canvas)).toBeNull();
    expect(await extractVideoFrame({ videoWidth: 1280, videoHeight: 720, readyState: 1, currentTime: 0 }, () => canvas)).toBeNull();
    expect(await extractVideoFrame({ videoWidth: 1280, videoHeight: 720, readyState: 4, currentTime: 0 }, () => fakeCanvas(null).canvas)).toBeNull();
    expect(frameSize(3840, 2160)).toEqual({ width: 2560, height: 1440 });
    expect(frameSize(1280, 720)).toEqual({ width: 1280, height: 720 });
  });
});

'use client';

import { MAX_DOCUMENT_SIZE_BYTES } from '@/modules/documents/domain/file-rules';
import { normalizeRecorderVideoMime, pickRecorderMimeType } from '../domain/video-mime';

const SIZE_WARN_RATIO = 0.9;
const DEFAULT_VIDEO_BPS = 1_750_000;
const MIN_VIDEO_BPS = 1_500_000;
const MAX_VIDEO_BPS = 2_000_000;

export type RecordFieldVideoStopResult = {
  readonly blob: Blob;
  readonly mimeType: string;
  readonly sizeBytes: number;
};

export type RecordFieldVideoResult =
  | {
      readonly kind: 'recording';
      readonly stop: () => Promise<RecordFieldVideoStopResult>;
      readonly cancel: () => void;
    }
  | { readonly kind: 'fallback' };

export type RecordFieldVideoOptions = {
  readonly onDurationMs?: (durationMs: number) => void;
  readonly onSizeBytes?: (sizeBytes: number) => void;
  readonly onApproachingLimit?: () => void;
  readonly videoBitsPerSecond?: number;
};

export function isOptimizedRecordingSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  if (typeof MediaRecorder === 'undefined') return false;
  return pickRecorderMimeType() !== null;
}

function clampBitrate(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return DEFAULT_VIDEO_BPS;
  return Math.min(MAX_VIDEO_BPS, Math.max(MIN_VIDEO_BPS, Math.round(value)));
}

/**
 * Lightweight getUserMedia + MediaRecorder path for field video (~720p / ~1.5–2 Mbps best-effort).
 * Returns `{ kind: 'fallback' }` when optimized recording is unavailable.
 */
export async function recordFieldVideo(
  options: RecordFieldVideoOptions = {},
): Promise<RecordFieldVideoResult> {
  const recorderMime = pickRecorderMimeType();
  if (!recorderMime) return { kind: 'fallback' };

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: true,
  });

  const chunks: Blob[] = [];
  let totalSize = 0;
  let warned = false;
  const warnThreshold = Math.floor(MAX_DOCUMENT_SIZE_BYTES * SIZE_WARN_RATIO);
  const startTime = Date.now();
  let durationTimer: number | undefined;

  const stopTracks = () => {
    for (const track of stream.getTracks()) track.stop();
  };

  const recorder = new MediaRecorder(stream, {
    mimeType: recorderMime,
    videoBitsPerSecond: clampBitrate(options.videoBitsPerSecond),
    audioBitsPerSecond: 128_000,
  });

  return new Promise((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      chunks.push(event.data);
      totalSize += event.data.size;
      options.onSizeBytes?.(totalSize);
      if (!warned && totalSize >= warnThreshold) {
        warned = true;
        options.onApproachingLimit?.();
      }
      if (totalSize >= MAX_DOCUMENT_SIZE_BYTES && recorder.state === 'recording') {
        recorder.stop();
      }
    };

    recorder.onerror = () => {
      if (durationTimer !== undefined) window.clearInterval(durationTimer);
      stopTracks();
      reject(new Error('MediaRecorder error'));
    };

    recorder.onstart = () => {
      durationTimer = window.setInterval(() => {
        options.onDurationMs?.(Date.now() - startTime);
      }, 250);
    };

    recorder.start(1000);

    resolve({
      kind: 'recording',
      cancel: () => {
        if (durationTimer !== undefined) window.clearInterval(durationTimer);
        if (recorder.state !== 'inactive') {
          try {
            recorder.stop();
          } catch {
            /* already stopped */
          }
        }
        stopTracks();
        chunks.length = 0;
      },
      stop: () =>
        new Promise((stopResolve, stopReject) => {
          if (durationTimer !== undefined) window.clearInterval(durationTimer);

          recorder.onstop = () => {
            stopTracks();
            const uploadMime =
              normalizeRecorderVideoMime(recorder.mimeType || recorderMime) ??
              normalizeRecorderVideoMime(recorderMime) ??
              'video/webm';
            const blob = new Blob(chunks, { type: uploadMime });
            stopResolve({
              blob,
              mimeType: uploadMime,
              sizeBytes: blob.size,
            });
          };

          if (recorder.state === 'recording') {
            recorder.stop();
            return;
          }
          if (recorder.state === 'inactive' && chunks.length > 0) {
            recorder.onstop?.(new Event('stop'));
            return;
          }
          stopReject(new Error('Recorder not active'));
        }),
    });
  });
}

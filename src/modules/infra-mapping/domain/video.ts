/**
 * Short infrastructure videos - shared rules (pure, client-safe, no I/O).
 *
 * A video is an ordinary infrastructure capture whose evidence file is a `video` instead of a photo:
 * same locations, same cloud folder, same permissions. Nothing here talks to storage; the byte
 * transfer rules (chunk size, single-request limit) live here so the browser and the server agree.
 */

export const INFRA_VIDEO_MAX_SECONDS = 30;
export const INFRA_VIDEO_MAX_MS = INFRA_VIDEO_MAX_SECONDS * 1000;
/** A little slack for the container's own rounding when a phone's native recorder is used. */
export const INFRA_VIDEO_DURATION_TOLERANCE_MS = 750;

const MB = 1024 * 1024;
/** Upper bound for a picked file (a 30 s 720p recording is ~4-6 MB; native phone video is bigger). */
export const INFRA_VIDEO_MAX_BYTES = 120 * MB;

/** Recorder targets (the browser/device may not honour them exactly). */
export const INFRA_VIDEO_WIDTH = 1280;
export const INFRA_VIDEO_HEIGHT = 720;
export const INFRA_VIDEO_BITS_PER_SECOND = 1_250_000;
export const INFRA_VIDEO_FRAME_RATE = 30;

/**
 * Bytes per upload request. Vercel rejects request bodies above 4.5 MB, so a video never travels
 * in one request unless it is small. 2.5 MiB is a multiple of 256 KiB (Google Drive) and of 320 KiB
 * (OneDrive), the two granularities the providers demand for every chunk except the last.
 */
export const INFRA_VIDEO_CHUNK_BYTES = 2_621_440;
/** Up to this size the whole file goes in one request (works with every provider). */
export const INFRA_VIDEO_SINGLE_MAX_BYTES = 4 * MB;

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/3gpp': '3gp',
};

const MIME_ALIASES: Readonly<Record<string, string>> = {
  'video/x-m4v': 'video/mp4',
  'video/m4v': 'video/mp4',
  'video/x-matroska': 'video/webm',
};

const EXTENSION_TO_MIME: Readonly<Record<string, string>> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  qt: 'video/quicktime',
  '3gp': 'video/3gpp',
};

/** `video/webm;codecs=vp9` -> `video/webm`; empty / generic types are inferred from the extension. */
export function normalizeVideoMime(rawType: string | null | undefined, fileName?: string | null): string | null {
  const base = (rawType ?? '').split(';')[0]!.trim().toLowerCase();
  const aliased = MIME_ALIASES[base] ?? base;
  if (MIME_EXTENSIONS[aliased]) return aliased;
  if (!base || base === 'application/octet-stream') {
    const ext = (fileName ?? '').toLowerCase().match(/\.([a-z0-9]{1,5})$/)?.[1];
    return (ext && EXTENSION_TO_MIME[ext]) || null;
  }
  return null;
}

export function isVideoMime(mimeType: string | null | undefined): boolean {
  return Boolean(mimeType && mimeType.toLowerCase().startsWith('video/'));
}

export function videoExtension(mimeType: string): string {
  return MIME_EXTENSIONS[mimeType] ?? 'mp4';
}

/**
 * Best container the device's MediaRecorder can produce. MP4 first because it plays everywhere
 * (iOS included); WebM (VP9, then VP8) is the Chromium / Firefox fallback.
 */
export const RECORDER_MIME_CANDIDATES: readonly string[] = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export function pickRecorderMimeType(isTypeSupported: (type: string) => boolean): string | null {
  for (const candidate of RECORDER_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(candidate)) return candidate;
    } catch {
      // a throwing probe means "not supported"
    }
  }
  return null;
}

export type VideoRejection = 'type' | 'empty' | 'too_large' | 'too_long' | 'unknown_duration';

export type VideoCheck =
  | { readonly ok: true; readonly mimeType: string }
  | { readonly ok: false; readonly reason: VideoRejection };

/** Validates a recorded or picked video before anything is registered or uploaded. */
export function checkInfraVideo(input: {
  readonly mimeType: string | null | undefined;
  readonly fileName?: string | null;
  readonly sizeBytes: number;
  readonly durationMs: number | null;
}): VideoCheck {
  const mimeType = normalizeVideoMime(input.mimeType, input.fileName);
  if (!mimeType) return { ok: false, reason: 'type' };
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) return { ok: false, reason: 'empty' };
  if (input.sizeBytes > INFRA_VIDEO_MAX_BYTES) return { ok: false, reason: 'too_large' };
  if (input.durationMs === null || !Number.isFinite(input.durationMs) || input.durationMs <= 0) {
    return { ok: false, reason: 'unknown_duration' };
  }
  if (input.durationMs > INFRA_VIDEO_MAX_MS + INFRA_VIDEO_DURATION_TOLERANCE_MS) return { ok: false, reason: 'too_long' };
  return { ok: true, mimeType };
}

export const VIDEO_REJECTION_MESSAGES: Readonly<Record<VideoRejection, string>> = {
  type: 'סוג הסרטון אינו נתמך. בחרו סרטון MP4, MOV, WEBM או 3GP.',
  empty: 'הסרטון ריק.',
  too_large: 'הסרטון גדול מדי (עד 120MB). צלמו שוב או בחרו סרטון קצר יותר.',
  too_long: 'הסרטון ארוך מ-30 שניות. בחרו סרטון קצר יותר.',
  unknown_duration: 'לא ניתן לקרוא את הסרטון. בחרו סרטון אחר או צלמו מחדש.',
};

/** Whole milliseconds, capped to the allowed maximum (a recorder timer may overshoot by a frame). */
export function clampVideoDurationMs(ms: number): number {
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.min(Math.round(ms), INFRA_VIDEO_MAX_MS);
}

/**
 * Evidence file name of a video: unique, sortable, no personal data. The duration is part of the
 * name (`-17s`) so the gallery can show it without opening the file.
 */
export function infraVideoFileName(input: {
  capturedAt: Date;
  clientCaptureId: string;
  durationMs: number;
  mimeType: string;
}): string {
  const iso = input.capturedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const seconds = Math.max(1, Math.round(clampVideoDurationMs(input.durationMs) / 1000));
  return `infra-video-${iso}-${input.clientCaptureId.slice(0, 8)}-${seconds}s.${videoExtension(input.mimeType)}`;
}

/** Duration (ms) encoded in an infra video file name, or null for any other name. */
export function parseVideoDurationMs(fileName: string | null | undefined): number | null {
  const match = (fileName ?? '').match(/-(\d{1,3})s\.[a-z0-9]{2,4}$/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  return seconds > 0 && seconds <= INFRA_VIDEO_MAX_SECONDS + 1 ? seconds * 1000 : null;
}

/** `0:07`, `0:30`. */
export function formatVideoDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export interface VideoChunkPlan {
  readonly offset: number;
  readonly length: number;
  readonly final: boolean;
}

/** True when the file must be sent in several requests. */
export function needsChunking(totalBytes: number): boolean {
  return totalBytes > INFRA_VIDEO_SINGLE_MAX_BYTES;
}

/** The next request for a transfer that already persisted `offset` bytes. */
export function nextChunk(totalBytes: number, offset: number): VideoChunkPlan | null {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0 || offset < 0 || offset >= totalBytes) return null;
  if (!needsChunking(totalBytes)) return { offset: 0, length: totalBytes, final: true };
  const length = Math.min(INFRA_VIDEO_CHUNK_BYTES, totalBytes - offset);
  return { offset, length, final: offset + length >= totalBytes };
}

/**
 * Shape the server validates for every chunk: the whole file at once, or exactly one chunk size
 * except for the last piece (the providers require aligned chunk lengths, not aligned offsets).
 */
export function isValidChunkRequest(input: { totalBytes: number; offset: number; length: number }): boolean {
  const { totalBytes, offset, length } = input;
  if (!Number.isInteger(totalBytes) || !Number.isInteger(offset) || !Number.isInteger(length)) return false;
  if (totalBytes <= 0 || offset < 0 || length <= 0 || offset + length > totalBytes) return false;
  if (!needsChunking(totalBytes)) return offset === 0 && length === totalBytes;
  const isLast = offset + length === totalBytes;
  return isLast ? length <= INFRA_VIDEO_CHUNK_BYTES : length === INFRA_VIDEO_CHUNK_BYTES;
}

export const VIDEO_ENTITY_UPLOAD_HEADERS = {
  offset: 'x-upload-offset',
  total: 'x-upload-total',
  session: 'x-upload-session',
} as const;

export interface VideoChunkResponse {
  readonly done: boolean;
  readonly nextOffset: number;
  readonly session: string | null;
}

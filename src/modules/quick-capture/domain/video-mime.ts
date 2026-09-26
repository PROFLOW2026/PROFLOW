/**
 * Video MIME helpers for Quick Capture sessions.
 * Mirrors the planned allowlist in documents/file-rules (mp4, quicktime, webm).
 */

const ALLOWED_VIDEO_MIMES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

/** @see documents/domain/file-rules — video allowlist extension point */
export function isVideoMimeType(mimeType: string | null | undefined): boolean {
  const normalized = mimeType?.trim().toLowerCase() ?? '';
  return ALLOWED_VIDEO_MIMES.has(normalized);
}

export function isVideoSessionMime(mimeType: string | null | undefined): boolean {
  return isVideoMimeType(mimeType);
}

export const APPROVED_VIDEO_MIME_TYPES = [...ALLOWED_VIDEO_MIMES] as const;

export type ApprovedVideoMimeType = (typeof APPROVED_VIDEO_MIME_TYPES)[number];

const RECORDER_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/quicktime',
] as const;

/** Pick the first MediaRecorder MIME supported by the current browser. */
export function pickRecorderMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const mime of RECORDER_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

/** Map MediaRecorder output to an upload-safe MIME when possible. */
export function normalizeRecorderVideoMime(reportedType: string | null | undefined): string | null {
  const normalized = reportedType?.trim().toLowerCase() ?? '';
  if (isVideoMimeType(normalized)) return normalized;
  if (normalized.includes('mp4')) return 'video/mp4';
  if (normalized.includes('webm')) return 'video/webm';
  if (normalized.includes('quicktime') || normalized.endsWith('mov')) return 'video/quicktime';
  return null;
}

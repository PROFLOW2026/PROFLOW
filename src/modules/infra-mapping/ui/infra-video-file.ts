import {
  VIDEO_REJECTION_MESSAGES,
  checkInfraVideo,
  clampVideoDurationMs,
  normalizeVideoMime,
} from '../domain/video';

/** Duration (ms) of a video file via its metadata; null when the browser cannot read it. */
export function readVideoDurationMs(file: Blob, timeoutMs = 8000): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      const seconds = video.duration;
      finish(Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null);
    };
    video.onerror = () => finish(null);
    video.src = url;
  });
}

export type PickedVideo =
  | { readonly ok: true; readonly file: File; readonly durationMs: number }
  | { readonly ok: false; readonly error: string };

/**
 * A video chosen from the phone: enforces type, size and the 30 second limit before anything is
 * registered. The returned file always carries a normalized video MIME type.
 */
export async function inspectPickedVideo(file: File): Promise<PickedVideo> {
  const mimeType = normalizeVideoMime(file.type, file.name);
  const durationMs = mimeType ? await readVideoDurationMs(file) : null;
  const check = checkInfraVideo({ mimeType: file.type, fileName: file.name, sizeBytes: file.size, durationMs });
  if (!check.ok) return { ok: false, error: VIDEO_REJECTION_MESSAGES[check.reason] };
  const normalized = file.type === check.mimeType ? file : new File([file], file.name, { type: check.mimeType });
  return { ok: true, file: normalized, durationMs: clampVideoDurationMs(durationMs ?? 0) };
}

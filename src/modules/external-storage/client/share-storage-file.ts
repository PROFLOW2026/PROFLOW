'use client';

export type ShareStorageFileInput = {
  downloadUrl: string;
  filename: string;
  mimeType: string;
};

export type ShareStorageFileResult =
  | { ok: true; method: 'web_share' | 'download_fallback' }
  | { ok: false; reason: 'unsupported' | 'aborted' | 'failed'; message?: string };

function sanitizeFilename(name: string): string {
  const trimmed = name.trim() || 'file';
  return trimmed.replace(/[/\\?%*:|"<>]/g, '_');
}

export function canShareFilesViaWebShare(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') {
    return false;
  }
  try {
    const probe = new File([''], 'probe.txt', { type: 'text/plain' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

async function fetchFileBlob(input: ShareStorageFileInput): Promise<Blob> {
  const response = await fetch(input.downloadUrl, {
    method: 'GET',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`fetch_failed_${response.status}`);
  }
  return response.blob();
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Share actual file bytes via Web Share API, with download fallback on desktop.
 */
export async function shareStorageFile(input: ShareStorageFileInput): Promise<ShareStorageFileResult> {
  const filename = sanitizeFilename(input.filename);
  const mimeType = input.mimeType?.trim() || 'application/octet-stream';

  try {
    const blob = await fetchFileBlob(input);
    const file = new File([blob], filename, { type: blob.type || mimeType });

    if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
      const payload = { files: [file], title: filename };
      if (navigator.canShare(payload)) {
        await navigator.share(payload);
        return { ok: true, method: 'web_share' };
      }
      return { ok: false, reason: 'unsupported' };
    }

    return { ok: false, reason: 'unsupported' };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, reason: 'aborted' };
    }
    return {
      ok: false,
      reason: 'failed',
      message: error instanceof Error ? error.message : undefined,
    };
  }
}

/** Download fallback when native file share is unavailable. */
export async function downloadStorageFile(input: ShareStorageFileInput): Promise<void> {
  const filename = sanitizeFilename(input.filename);
  const mimeType = input.mimeType?.trim() || 'application/octet-stream';
  const blob = await fetchFileBlob(input);
  const fileBlob = blob.type ? blob : new Blob([blob], { type: mimeType });
  triggerDownload(fileBlob, filename);
}

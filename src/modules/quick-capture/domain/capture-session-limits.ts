import type { SessionFileInput, SessionKind } from './types';
import { isVideoMimeType } from './video-mime';

export const MAX_CAPTURE_IMAGES = 5;

export type ValidateSessionFilesResult =
  | { readonly ok: true; readonly sessionKind: SessionKind }
  | {
      readonly ok: false;
      readonly code:
        | 'empty'
        | 'too_many_images'
        | 'too_many_videos'
        | 'too_many_files'
        | 'mixed_modes'
        | 'unsupported_mime';
      readonly messageKey: string;
    };

function isImageMime(mimeType: string): boolean {
  const normalized = mimeType.trim().toLowerCase();
  return normalized.startsWith('image/');
}

function isPdfMime(mimeType: string): boolean {
  return mimeType.trim().toLowerCase() === 'application/pdf';
}

function isOtherFileMime(mimeType: string): boolean {
  return !isImageMime(mimeType) && !isVideoMimeType(mimeType) && !isPdfMime(mimeType);
}

/**
 * Enforces v1 session modes: 1–5 images OR 1 video OR 1 PDF/file — never mixed.
 */
export function validateSessionFiles(files: readonly SessionFileInput[]): ValidateSessionFilesResult {
  if (files.length === 0) {
    return { ok: false, code: 'empty', messageKey: 'quickCapture.errors.emptySession' };
  }

  let imageCount = 0;
  let videoCount = 0;
  let pdfCount = 0;
  let otherCount = 0;

  for (const file of files) {
    const mime = file.mimeType.trim().toLowerCase();
    if (isVideoMimeType(mime)) {
      videoCount += 1;
      continue;
    }
    if (isImageMime(mime)) {
      imageCount += 1;
      continue;
    }
    if (isPdfMime(mime)) {
      pdfCount += 1;
      continue;
    }
    if (isOtherFileMime(mime)) {
      otherCount += 1;
      continue;
    }
    return {
      ok: false,
      code: 'unsupported_mime',
      messageKey: 'quickCapture.errors.unsupportedMime',
    };
  }

  const modeCount = [imageCount > 0, videoCount > 0, pdfCount > 0, otherCount > 0].filter(
    Boolean,
  ).length;
  if (modeCount > 1) {
    return { ok: false, code: 'mixed_modes', messageKey: 'quickCapture.errors.mixedSessionModes' };
  }

  if (videoCount > 0) {
    if (files.length !== 1) {
      return { ok: false, code: 'too_many_videos', messageKey: 'quickCapture.errors.tooManyVideos' };
    }
    return { ok: true, sessionKind: 'video' };
  }

  if (imageCount > 0) {
    if (files.length > MAX_CAPTURE_IMAGES) {
      return {
        ok: false,
        code: 'too_many_images',
        messageKey: 'quickCapture.errors.tooManyImages',
      };
    }
    return { ok: true, sessionKind: 'images' };
  }

  if (pdfCount > 0) {
    if (files.length !== 1) {
      return { ok: false, code: 'too_many_files', messageKey: 'quickCapture.errors.tooManyFiles' };
    }
    return { ok: true, sessionKind: 'pdf' };
  }

  if (otherCount > 0) {
    if (files.length !== 1) {
      return { ok: false, code: 'too_many_files', messageKey: 'quickCapture.errors.tooManyFiles' };
    }
    return { ok: true, sessionKind: 'file' };
  }

  return { ok: false, code: 'unsupported_mime', messageKey: 'quickCapture.errors.unsupportedMime' };
}

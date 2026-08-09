/**
 * Baseline upload constraints (doc 75 §5).
 */

export const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf'] as const;

const ALLOWED_MIME_EXACT = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/** Browser-safe inline preview — excludes HEIC/HEIF (often unsupported). */
const BROWSER_PREVIEWABLE_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function isAllowedMimeType(mimeType: string): boolean {
  const normalized = mimeType.trim().toLowerCase();
  if (ALLOWED_MIME_EXACT.has(normalized)) return true;
  return ALLOWED_MIME_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/** True when a short-lived signed URL may be shown in an `<img>` safely. */
export function isBrowserPreviewableImageMime(mimeType: string): boolean {
  return BROWSER_PREVIEWABLE_IMAGE_MIMES.has(mimeType.trim().toLowerCase());
}

/** True when a signed URL may be embedded in an `<iframe>` for PDF preview. */
export function isBrowserPreviewablePdfMime(mimeType: string): boolean {
  return mimeType.trim().toLowerCase() === 'application/pdf';
}

/** Image or PDF inline preview via short-lived signed URL (never a public path). */
export function isBrowserPreviewableMime(mimeType: string): boolean {
  return isBrowserPreviewableImageMime(mimeType) || isBrowserPreviewablePdfMime(mimeType);
}

export function isAllowedFileSize(sizeBytes: number): boolean {
  return sizeBytes > 0 && sizeBytes <= MAX_DOCUMENT_SIZE_BYTES;
}

export function validateUploadConstraints(input: {
  mimeType: string;
  sizeBytes: number;
}): { valid: true } | { valid: false; reason: 'mime' | 'size' } {
  if (!isAllowedMimeType(input.mimeType)) return { valid: false, reason: 'mime' };
  if (!isAllowedFileSize(input.sizeBytes)) return { valid: false, reason: 'size' };
  return { valid: true };
}

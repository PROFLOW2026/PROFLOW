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

/** Browser-safe inline preview - excludes HEIC/HEIF (often unsupported). */
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

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'image/tif': 'image/tiff',
};

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const GENERIC_OR_EMPTY_MIME = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
  'application/x-download',
]);

export type NormalizeUploadMimeResult =
  | { ok: true; mimeType: string; inferredFromExtension: boolean }
  | { ok: false; reason: 'mime' };

/** Canonical MIME for upload. Infer from extension only when the browser type is empty/generic. */
export function normalizeUploadMime(
  reportedType: string | undefined | null,
  fileName: string,
): NormalizeUploadMimeResult {
  const reported = (reportedType ?? '').trim().toLowerCase();
  const aliased = MIME_ALIASES[reported] ?? reported;

  if (aliased && !GENERIC_OR_EMPTY_MIME.has(aliased)) {
    if (isAllowedMimeType(aliased)) {
      return { ok: true, mimeType: aliased, inferredFromExtension: false };
    }
    return { ok: false, reason: 'mime' };
  }

  const ext = fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  const inferred = EXT_TO_MIME[ext];
  if (inferred && isAllowedMimeType(inferred)) {
    return { ok: true, mimeType: inferred, inferredFromExtension: true };
  }
  return { ok: false, reason: 'mime' };
}

/** ASCII-only object extension for storage keys. Original filename stays in DB metadata. */
export function storageObjectExtension(fileName: string): string {
  const ext = fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  if (ext === 'jpeg' || ext === 'jfif') return 'jpg';
  if (ext === 'tif') return 'tiff';
  if (EXT_TO_MIME[ext]) return ext === 'jpeg' ? 'jpg' : ext;
  return 'bin';
}

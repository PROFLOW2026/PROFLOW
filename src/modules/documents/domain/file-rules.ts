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

export function isAllowedMimeType(mimeType: string): boolean {
  const normalized = mimeType.trim().toLowerCase();
  if (ALLOWED_MIME_EXACT.has(normalized)) return true;
  return ALLOWED_MIME_PREFIXES.some((prefix) => normalized.startsWith(prefix));
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

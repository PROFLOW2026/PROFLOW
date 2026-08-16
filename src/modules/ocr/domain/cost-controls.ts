/**
 * OCR cost / abuse controls. Application-level - not a billing product.
 * Effective file/page limits come from provider capabilities (F0/S0).
 */

import {
  OCR_APP_MAX_FILE_BYTES,
  resolveAzureCapabilities,
  resolveDefaultOcrCapabilities,
  type OcrProviderCapabilities,
} from './provider-capabilities';

export const OCR_MAX_FILE_BYTES = OCR_APP_MAX_FILE_BYTES;
/** @deprecated Prefer capability.maxPages - kept for callers expecting a constant. */
export const OCR_MAX_PAGES = 10;
export const OCR_PROVIDER_TIMEOUT_MS = 60_000;
export const OCR_POLL_INTERVAL_MS = 1_000;
export const OCR_MAX_MANUAL_RETRIES = 2;
export const OCR_TRANSIENT_RETRY_LIMIT = 3;

const OCR_MIME_EXACT = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/bmp',
  'image/tiff',
  'image/tif',
  'image/heic',
  'image/heif',
]);

/** Azure prebuilt invoice/receipt do not list WebP - reject before the paid call. */
export function isOcrSupportedMime(mimeType: string | null | undefined): boolean {
  const normalized = mimeType?.trim().toLowerCase() ?? '';
  if (OCR_MIME_EXACT.has(normalized)) return true;
  return normalized.startsWith('image/jpeg') || normalized.startsWith('image/png');
}

export function resolveActiveOcrCapabilities(
  providerId?: string | null,
): OcrProviderCapabilities {
  if (providerId === 'azure' || (!providerId && process.env.OCR_PROVIDER === 'azure')) {
    return resolveAzureCapabilities();
  }
  return resolveDefaultOcrCapabilities();
}

export function assertOcrFileLimits(
  input: {
    mimeType?: string | null;
    sizeBytes?: number | null;
    pageCount?: number | null;
  },
  capabilities: OcrProviderCapabilities = resolveActiveOcrCapabilities(),
): { ok: true } | { ok: false; code: 'unsupported_file' | 'too_large' | 'too_many_pages' } {
  if (input.mimeType && !isOcrSupportedMime(input.mimeType)) {
    return { ok: false, code: 'unsupported_file' };
  }
  if (
    input.sizeBytes != null &&
    (input.sizeBytes <= 0 || input.sizeBytes > capabilities.maxFileBytes)
  ) {
    return { ok: false, code: 'too_large' };
  }
  if (input.pageCount != null && input.pageCount > capabilities.maxPages) {
    return { ok: false, code: 'too_many_pages' };
  }
  return { ok: true };
}

export function estimatePdfPageCount(bytes: Uint8Array): number | null {
  if (bytes.length < 5) return null;
  const head = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!, bytes[4]!);
  if (!head.startsWith('%PDF')) return 1;
  const text = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 2_000_000))).toString('latin1');
  const pageMarks = text.match(/\/Type\s*\/Page(?!s)/g);
  if (!pageMarks || pageMarks.length === 0) return null;
  return pageMarks.length;
}

export function ocrPageCountForFile(mimeType: string | null | undefined, bytes: Uint8Array): number {
  if (mimeType?.toLowerCase() === 'application/pdf') {
    return estimatePdfPageCount(bytes) ?? 1;
  }
  return 1;
}

export function azurePagesQuery(
  pageCount: number,
  maxPages: number = resolveAzureCapabilities().maxPages,
): string {
  const capped = Math.min(Math.max(pageCount, 1), maxPages);
  return capped <= 1 ? '1' : `1-${capped}`;
}

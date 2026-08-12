import { describe, expect, it } from 'vitest';
import {
  isAllowedFileSize,
  isAllowedMimeType,
  isBrowserPreviewableImageMime,
  MAX_DOCUMENT_SIZE_BYTES,
  normalizeUploadMime,
  storageObjectExtension,
  validateUploadConstraints,
} from '@/modules/documents/domain/file-rules';

describe('document upload constraints', () => {
  it('allows common mime types', () => {
    expect(isAllowedMimeType('application/pdf')).toBe(true);
    expect(isAllowedMimeType('image/jpeg')).toBe(true);
  });

  it('rejects executable mime types', () => {
    expect(isAllowedMimeType('application/x-msdownload')).toBe(false);
  });

  it('enforces max size', () => {
    expect(isAllowedFileSize(MAX_DOCUMENT_SIZE_BYTES)).toBe(true);
    expect(isAllowedFileSize(MAX_DOCUMENT_SIZE_BYTES + 1)).toBe(false);
    expect(isAllowedFileSize(0)).toBe(false);
  });

  it('returns structured validation results', () => {
    expect(validateUploadConstraints({ mimeType: 'application/pdf', sizeBytes: 1024 }).valid).toBe(true);
    expect(validateUploadConstraints({ mimeType: 'application/x-msdownload', sizeBytes: 1024 })).toEqual({
      valid: false,
      reason: 'mime',
    });
  });

  it('normalizes empty, alias, and Hebrew/timestamp filenames to a supported MIME', () => {
    expect(normalizeUploadMime('', 'receipt.jpg')).toEqual({
      ok: true,
      mimeType: 'image/jpeg',
      inferredFromExtension: true,
    });
    expect(normalizeUploadMime('application/octet-stream', 'קבלה 12.08.2026.JPG')).toEqual({
      ok: true,
      mimeType: 'image/jpeg',
      inferredFromExtension: true,
    });
    expect(normalizeUploadMime('image/jpg', 'photo.jpeg')).toEqual({
      ok: true,
      mimeType: 'image/jpeg',
      inferredFromExtension: false,
    });
    expect(normalizeUploadMime('', 'invoice.PDF')).toEqual({
      ok: true,
      mimeType: 'application/pdf',
      inferredFromExtension: true,
    });
    expect(normalizeUploadMime('', 'קבלה (מרכזת) 12.08.2026.jpg')).toEqual({
      ok: true,
      mimeType: 'image/jpeg',
      inferredFromExtension: true,
    });
    expect(normalizeUploadMime('image/jpeg', 'scan.png')).toEqual({
      ok: true,
      mimeType: 'image/jpeg',
      inferredFromExtension: false,
    });
    expect(normalizeUploadMime('application/x-msdownload', 'invoice.pdf')).toEqual({
      ok: false,
      reason: 'mime',
    });
    expect(normalizeUploadMime('', 'virus.exe')).toEqual({ ok: false, reason: 'mime' });
  });

  it('uses ASCII-only storage extensions even for Hebrew names', () => {
    expect(storageObjectExtension('קבלה (1) 20240101_120000.jpeg')).toBe('jpg');
    expect(storageObjectExtension('scan.PNG')).toBe('png');
    expect(storageObjectExtension('file')).toBe('bin');
  });

  it('allows browser-safe image preview mimes only', () => {
    expect(isBrowserPreviewableImageMime('image/jpeg')).toBe(true);
    expect(isBrowserPreviewableImageMime('image/png')).toBe(true);
    expect(isBrowserPreviewableImageMime('image/webp')).toBe(true);
    expect(isBrowserPreviewableImageMime('image/heic')).toBe(false);
    expect(isBrowserPreviewableImageMime('application/pdf')).toBe(false);
  });
});

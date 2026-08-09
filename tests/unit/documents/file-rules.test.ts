import { describe, expect, it } from 'vitest';
import {
  isAllowedFileSize,
  isAllowedMimeType,
  isBrowserPreviewableImageMime,
  MAX_DOCUMENT_SIZE_BYTES,
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

  it('allows browser-safe image preview mimes only', () => {
    expect(isBrowserPreviewableImageMime('image/jpeg')).toBe(true);
    expect(isBrowserPreviewableImageMime('image/png')).toBe(true);
    expect(isBrowserPreviewableImageMime('image/webp')).toBe(true);
    expect(isBrowserPreviewableImageMime('image/heic')).toBe(false);
    expect(isBrowserPreviewableImageMime('application/pdf')).toBe(false);
  });
});

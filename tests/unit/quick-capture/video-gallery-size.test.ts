import { describe, expect, it } from 'vitest';
import {
  isAllowedFileSize,
  MAX_DOCUMENT_SIZE_BYTES,
} from '@/modules/documents/domain/file-rules';

const TWENTY_FIVE_MB = 25 * 1024 * 1024;

describe('Quick Capture video/file size cap', () => {
  it('uses the shared 25MB document limit constant', () => {
    expect(MAX_DOCUMENT_SIZE_BYTES).toBe(TWENTY_FIVE_MB);
  });

  it('allows sizes up to and including 25MB', () => {
    expect(isAllowedFileSize(1)).toBe(true);
    expect(isAllowedFileSize(TWENTY_FIVE_MB)).toBe(true);
  });

  it('rejects zero, negative, and over-limit sizes', () => {
    expect(isAllowedFileSize(0)).toBe(false);
    expect(isAllowedFileSize(-1)).toBe(false);
    expect(isAllowedFileSize(TWENTY_FIVE_MB + 1)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { resolveQuickCaptureOcrErrorKey } from '@/modules/quick-capture/domain/resolve-ocr-error-key';

describe('resolveQuickCaptureOcrErrorKey', () => {
  it('maps storage_download with English provider text to storageDownload', () => {
    expect(
      resolveQuickCaptureOcrErrorKey({
        errorCode: 'storage_download',
        errorMessage: 'External file unavailable',
        lastError: 'External file unavailable',
      }),
    ).toBe('storageDownload');
  });
});

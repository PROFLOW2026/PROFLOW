import type { ExtractionJob } from '@/modules/ocr/domain/types';

export type QuickCaptureOcrErrorKey =
  | 'storageDownload'
  | 'storageDisconnected'
  | 'storageMissing'
  | 'storagePermission'
  | 'providerError'
  | 'timeout'
  | 'tooLarge'
  | 'tooManyPages'
  | 'retryLimit'
  | 'generic';

type OcrErrorSource = Pick<ExtractionJob, 'errorCode' | 'errorMessage' | 'lastError'>;

export function resolveQuickCaptureOcrErrorKey(job: OcrErrorSource): QuickCaptureOcrErrorKey {
  const code = job.errorCode ?? '';
  const detail = (job.lastError ?? job.errorMessage ?? '').trim().toLowerCase();

  if (code === 'storage_download') {
    if (detail.includes('disconnected')) return 'storageDisconnected';
    if (detail.includes('missing')) return 'storageMissing';
    if (detail.includes('denied') || detail.includes('permission')) return 'storagePermission';
    return 'storageDownload';
  }
  if (code === 'timeout') return 'timeout';
  if (code === 'too_large') return 'tooLarge';
  if (code === 'too_many_pages') return 'tooManyPages';
  if (code === 'provider_error' || code === 'empty_result') return 'providerError';
  if (detail.includes('retry limit')) return 'retryLimit';
  return 'generic';
}

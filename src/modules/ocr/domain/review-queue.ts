import type { ExtractionJobStatus } from './types';

/**
 * Active review queue only.
 * Terminal `succeeded` / `rejected` jobs belong in history — never here.
 */
export const OCR_REVIEW_SURFACE_STATUSES: readonly ExtractionJobStatus[] = [
  'queued',
  'running',
  'processing',
  'needs_review',
  'failed',
];

/**
 * Read-only OCR review history — completed / rejected / cancelled jobs.
 * Not the active work queue.
 */
export const OCR_REVIEW_HISTORY_STATUSES: readonly ExtractionJobStatus[] = [
  'succeeded',
  'rejected',
  'cancelled',
];

export function isOcrActiveQueueStatus(status: ExtractionJobStatus): boolean {
  return (OCR_REVIEW_SURFACE_STATUSES as readonly string[]).includes(status);
}

export function isOcrHistoryStatus(status: ExtractionJobStatus): boolean {
  return (OCR_REVIEW_HISTORY_STATUSES as readonly string[]).includes(status);
}

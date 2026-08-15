import type { ExtractionJob, ExtractionJobStatus } from './types';

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

/** Inbox grouping on /documents/ocr-review — not history. */
export const OCR_INBOX_TABS = ['waiting', 'processing', 'needs_review', 'failed'] as const;
export type OcrInboxTab = (typeof OCR_INBOX_TABS)[number];

export function isOcrActiveQueueStatus(status: ExtractionJobStatus): boolean {
  return (OCR_REVIEW_SURFACE_STATUSES as readonly string[]).includes(status);
}

export function isOcrHistoryStatus(status: ExtractionJobStatus): boolean {
  return (OCR_REVIEW_HISTORY_STATUSES as readonly string[]).includes(status);
}

export function ocrInboxTabForStatus(status: ExtractionJobStatus): OcrInboxTab | null {
  if (status === 'queued') return 'waiting';
  if (status === 'running' || status === 'processing') return 'processing';
  if (status === 'needs_review') return 'needs_review';
  if (status === 'failed') return 'failed';
  return null;
}

/** Land on needs review when any job is waiting for a human; otherwise waiting. */
export function defaultOcrInboxTab(
  jobs: readonly Pick<ExtractionJob, 'status'>[],
): OcrInboxTab {
  if (jobs.some((job) => job.status === 'needs_review')) return 'needs_review';
  return 'waiting';
}

export function jobsForOcrInboxTab<T extends Pick<ExtractionJob, 'status'>>(
  jobs: readonly T[],
  tab: OcrInboxTab,
): T[] {
  return jobs.filter((job) => ocrInboxTabForStatus(job.status) === tab);
}

export function countOcrInboxTabs(
  jobs: readonly Pick<ExtractionJob, 'status'>[],
): Record<OcrInboxTab, number> {
  const counts: Record<OcrInboxTab, number> = {
    waiting: 0,
    processing: 0,
    needs_review: 0,
    failed: 0,
  };
  for (const job of jobs) {
    const tab = ocrInboxTabForStatus(job.status);
    if (tab) counts[tab] += 1;
  }
  return counts;
}

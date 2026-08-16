import { OCR_TRANSIENT_RETRY_LIMIT } from './cost-controls';
import type {
  ExtractionJob,
  ExtractionJobStatus,
  OcrBatch,
  OcrBatchStatus,
} from './types';

/** Unique-active window: at most one of these per (org, document, provider). */
export const OCR_ACTIVE_PROCESSING_STATUSES: readonly ExtractionJobStatus[] = [
  'queued',
  'running',
  'processing',
];

/** Human review queue - in-flight plus failed (retry) plus needs_review. */
export const OCR_WORKER_SUCCESS_STATUS: ExtractionJobStatus = 'needs_review';

export const OCR_WORKER_MAX_ATTEMPTS = OCR_TRANSIENT_RETRY_LIMIT;

const TERMINAL_STATUSES: readonly ExtractionJobStatus[] = [
  'needs_review',
  'succeeded',
  'failed',
  'rejected',
  'cancelled',
];

const TRANSIENT_ERROR_CODES = new Set(['timeout', 'provider_error']);

export function isOcrActiveProcessingStatus(status: string): boolean {
  return (OCR_ACTIVE_PROCESSING_STATUSES as readonly string[]).includes(status);
}

export function isOcrTerminalJobStatus(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function isOcrCancelableStatus(status: string): boolean {
  return status === 'queued';
}

/**
 * Provider "succeeded" is never ledger truth - it always lands in needs_review
 * so a human can confirm a DRAFT only.
 */
export function mapProviderSuccessToJobStatus(): ExtractionJobStatus {
  return OCR_WORKER_SUCCESS_STATUS;
}

export function isOcrTransientProviderError(errorCode: string | null | undefined): boolean {
  return Boolean(errorCode && TRANSIENT_ERROR_CODES.has(errorCode));
}

export function ocrRetryBackoffMs(attemptCount: number): number {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return 0;
  const capped = Math.max(1, attemptCount);
  return Math.min(500 * 2 ** (capped - 1), 4_000);
}

export function shouldRetryOcrAttempt(
  attemptCount: number,
  errorCode: string | null | undefined,
  maxAttempts: number = OCR_WORKER_MAX_ATTEMPTS,
): boolean {
  if (attemptCount >= maxAttempts) return false;
  if (!errorCode) return true;
  if (
    errorCode === 'not_configured' ||
    errorCode === 'unsupported_file' ||
    errorCode === 'too_large' ||
    errorCode === 'too_many_pages' ||
    errorCode === 'storage_download' ||
    errorCode === 'empty_result'
  ) {
    return false;
  }
  return isOcrTransientProviderError(errorCode) || errorCode === 'provider_error';
}

export function recountOcrBatchFromJobs(
  jobs: readonly Pick<ExtractionJob, 'status'>[],
  totalCount: number,
): Pick<OcrBatch, 'status' | 'totalCount' | 'completedCount' | 'failedCount'> {
  const total = Math.max(totalCount, jobs.length);
  let completedCount = 0;
  let failedCount = 0;
  let cancelledCount = 0;
  let activeCount = 0;

  for (const job of jobs) {
    if (isOcrActiveProcessingStatus(job.status)) {
      activeCount += 1;
      continue;
    }
    if (job.status === 'failed') {
      failedCount += 1;
      continue;
    }
    if (job.status === 'cancelled') {
      cancelledCount += 1;
      continue;
    }
    if (
      job.status === 'needs_review' ||
      job.status === 'succeeded' ||
      job.status === 'rejected'
    ) {
      completedCount += 1;
    }
  }

  let status: OcrBatchStatus = 'queued';
  if (jobs.length === 0 || total === 0) {
    status = 'queued';
  } else if (activeCount > 0) {
    status = jobs.some((job) => job.status === 'processing' || job.status === 'running')
      ? 'processing'
      : 'queued';
  } else if (cancelledCount === total) {
    status = 'cancelled';
  } else if (failedCount === total) {
    status = 'failed';
  } else {
    status = 'completed';
  }

  return { status, totalCount: total, completedCount, failedCount };
}

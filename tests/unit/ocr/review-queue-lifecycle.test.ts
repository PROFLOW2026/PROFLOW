import { describe, expect, it } from 'vitest';
import {
  isOcrActiveQueueStatus,
  isOcrHistoryStatus,
  OCR_REVIEW_HISTORY_STATUSES,
  OCR_REVIEW_SURFACE_STATUSES,
  countOcrInboxTabs,
  defaultOcrInboxTab,
  jobsForOcrInboxTab,
  ocrInboxTabForStatus,
} from '@/modules/ocr/domain/review-queue';

describe('OCR review queue lifecycle statuses', () => {
  it('keeps only actionable statuses on the active review surface', () => {
    expect([...OCR_REVIEW_SURFACE_STATUSES]).toEqual([
      'queued',
      'running',
      'processing',
      'needs_review',
      'failed',
    ]);
    expect(OCR_REVIEW_SURFACE_STATUSES).not.toContain('succeeded');
    expect(OCR_REVIEW_SURFACE_STATUSES).not.toContain('rejected');
    expect(OCR_REVIEW_SURFACE_STATUSES).not.toContain('cancelled');
  });

  it('places terminal reviews in history only', () => {
    expect([...OCR_REVIEW_HISTORY_STATUSES]).toEqual(['succeeded', 'rejected', 'cancelled']);
    expect(isOcrHistoryStatus('succeeded')).toBe(true);
    expect(isOcrHistoryStatus('rejected')).toBe(true);
    expect(isOcrActiveQueueStatus('needs_review')).toBe(true);
    expect(isOcrActiveQueueStatus('succeeded')).toBe(false);
    expect(isOcrActiveQueueStatus('rejected')).toBe(false);
  });

  it('groups the review inbox and lands on needs review when any exist', () => {
    expect(ocrInboxTabForStatus('queued')).toBe('waiting');
    expect(ocrInboxTabForStatus('running')).toBe('processing');
    expect(ocrInboxTabForStatus('processing')).toBe('processing');
    expect(ocrInboxTabForStatus('needs_review')).toBe('needs_review');
    expect(ocrInboxTabForStatus('failed')).toBe('failed');
    expect(ocrInboxTabForStatus('succeeded')).toBeNull();

    const mixed = [
      { status: 'queued' as const },
      { status: 'processing' as const },
      { status: 'needs_review' as const },
      { status: 'failed' as const },
    ];
    expect(defaultOcrInboxTab(mixed)).toBe('needs_review');
    expect(defaultOcrInboxTab([{ status: 'queued' }, { status: 'failed' }])).toBe('waiting');
    expect(countOcrInboxTabs(mixed)).toEqual({
      waiting: 1,
      processing: 1,
      needs_review: 1,
      failed: 1,
    });
    expect(
      jobsForOcrInboxTab(
        [
          { status: 'queued' as const },
          { status: 'needs_review' as const },
        ],
        'waiting',
      ),
    ).toEqual([{ status: 'queued' }]);
  });
});

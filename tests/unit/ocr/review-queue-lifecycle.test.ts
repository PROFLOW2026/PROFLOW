import { describe, expect, it } from 'vitest';
import {
  isOcrActiveQueueStatus,
  isOcrHistoryStatus,
  OCR_REVIEW_HISTORY_STATUSES,
  OCR_REVIEW_SURFACE_STATUSES,
} from '@/modules/ocr/domain/review-queue';

describe('OCR review queue lifecycle statuses', () => {
  it('keeps only actionable statuses on the active review surface', () => {
    expect([...OCR_REVIEW_SURFACE_STATUSES]).toEqual([
      'queued',
      'running',
      'needs_review',
      'failed',
    ]);
    expect(OCR_REVIEW_SURFACE_STATUSES).not.toContain('succeeded');
    expect(OCR_REVIEW_SURFACE_STATUSES).not.toContain('rejected');
  });

  it('places terminal reviews in history only', () => {
    expect([...OCR_REVIEW_HISTORY_STATUSES]).toEqual(['succeeded', 'rejected']);
    expect(isOcrHistoryStatus('succeeded')).toBe(true);
    expect(isOcrHistoryStatus('rejected')).toBe(true);
    expect(isOcrActiveQueueStatus('needs_review')).toBe(true);
    expect(isOcrActiveQueueStatus('succeeded')).toBe(false);
    expect(isOcrActiveQueueStatus('rejected')).toBe(false);
  });
});

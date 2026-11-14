import { describe, expect, it } from 'vitest';
import {
  buildMonthlyEmployerCostReviewWithDates,
  buildSerializedMonthReviewForClient,
} from './fixtures/month-review-shape';

describe('BUG-02 rsc-date-serialize-probe', () => {
  it('Drizzle-shaped monthReview contains Date instances on timestamp columns', () => {
    const review = buildMonthlyEmployerCostReviewWithDates();
    expect(review.month?.createdAt).toBeInstanceOf(Date);
    expect(review.month?.lockedAt).toBeInstanceOf(Date);
    expect(review.run?.appliedAt).toBeInstanceOf(Date);
    expect(review.months[0]?.updatedAt).toBeInstanceOf(Date);
  });

  it('JSON.stringify silently coerces Date (not equivalent to Flight semantics)', () => {
    const review = buildMonthlyEmployerCostReviewWithDates();
    const roundTrip = JSON.parse(JSON.stringify(review)) as typeof review;
    expect(typeof roundTrip.month?.createdAt).toBe('string');
    expect(review.month?.createdAt instanceof Date).toBe(true);
  });

  it('serialize-task-cards-style coercion removes Date instances from client props', () => {
    const review = buildMonthlyEmployerCostReviewWithDates();
    const serialized = buildSerializedMonthReviewForClient(review);
    const walk = (value: unknown): void => {
      if (value === null || value === undefined) return;
      if (typeof value !== 'object') return;
      expect(value).not.toBeInstanceOf(Date);
      if (Array.isArray(value)) {
        for (const entry of value) walk(entry);
        return;
      }
      for (const nested of Object.values(value)) walk(nested);
    };
    walk(serialized);
    expect(serialized.month).toMatchObject({
      createdAt: '2026-10-01T12:00:00.000Z',
      lockedAt: '2026-10-15T08:00:00.000Z',
    });
  });

  it('showMonthReview gate would be true when months array is non-empty', () => {
    const review = buildMonthlyEmployerCostReviewWithDates();
    const showMonthReview = Boolean(review.month || review.months.length > 0);
    expect(showMonthReview).toBe(true);
  });
});

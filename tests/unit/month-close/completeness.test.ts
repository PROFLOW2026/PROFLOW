import { describe, expect, it } from 'vitest';
import {
  buildCompletenessItems,
  formatCompletenessPercent,
  isCompletenessReady,
  scoreCompleteness,
} from '@/modules/month-close/domain/completeness';
import {
  assertCanTransitionMonthClose,
  canTransitionMonthClose,
} from '@/modules/month-close/domain/period-state';
import { yearMonthBounds } from '@/modules/month-close/domain/year-month';
import { DomainRuleError } from '@/shared/errors';

describe('month-close completeness scoring', () => {
  it('scores 100 when every applicable check is clear', () => {
    const snapshot = scoreCompleteness(
      [
        { key: 'missing_employer_cost_actual', applicable: true, issueCount: 0 },
        { key: 'unallocated_employee_cost', applicable: true, issueCount: 0 },
        { key: 'vendor_bills_unallocated', applicable: true, issueCount: 0 },
        { key: 'open_time_corrections', applicable: true, issueCount: 0 },
        { key: 'ap_anomalies', applicable: true, issueCount: 0 },
        { key: 'missing_project_allocations', applicable: true, issueCount: 0 },
        { key: 'unresolved_expense_drafts', applicable: true, issueCount: 0 },
        { key: 'incomplete_attendance', applicable: false, issueCount: 3 },
        { key: 'open_overhead_allocation', applicable: true, issueCount: 0 },
      ],
      { yearMonth: '2026-03', computedAt: '2026-03-31T12:00:00.000Z' },
    );

    expect(snapshot.percent).toBe(100);
    expect(snapshot.applicableCount).toBe(8);
    expect(snapshot.passedCount).toBe(8);
    expect(isCompletenessReady(snapshot)).toBe(true);
    expect(snapshot.items.find((item) => item.key === 'incomplete_attendance')).toMatchObject({
      applicable: false,
      issueCount: 0,
      scorePercent: 100,
    });
  });

  it('averages only applicable checks and keeps N/A transparent', () => {
    const snapshot = scoreCompleteness(
      [
        { key: 'missing_employer_cost_actual', applicable: true, issueCount: 2, sampleEntityIds: ['a'] },
        { key: 'unallocated_employee_cost', applicable: true, issueCount: 0 },
        { key: 'vendor_bills_unallocated', applicable: true, issueCount: 1 },
        { key: 'open_time_corrections', applicable: true, issueCount: 0 },
        { key: 'ap_anomalies', applicable: true, issueCount: 0 },
        { key: 'missing_project_allocations', applicable: true, issueCount: 0 },
        { key: 'unresolved_expense_drafts', applicable: true, issueCount: 0 },
        { key: 'incomplete_attendance', applicable: false, issueCount: 9 },
        { key: 'open_overhead_allocation', applicable: true, issueCount: 0 },
      ],
      { yearMonth: '2026-04' },
    );

    // 8 applicable, 2 failing → 75%
    expect(snapshot.percent).toBe(75);
    expect(snapshot.passedCount).toBe(6);
    expect(isCompletenessReady(snapshot)).toBe(false);

    const missing = snapshot.items.find((item) => item.key === 'missing_employer_cost_actual');
    expect(missing?.scorePercent).toBe(0);
    expect(missing?.issueCount).toBe(2);
    expect(missing?.sampleEntityIds).toEqual(['a']);
  });

  it('treats zero applicable checks as complete', () => {
    const items = buildCompletenessItems([]);
    expect(items).toHaveLength(9);
    expect(items.every((item) => !item.applicable && item.scorePercent === 100)).toBe(true);

    const snapshot = scoreCompleteness([], { yearMonth: '2026-01' });
    expect(snapshot.percent).toBe(100);
    expect(formatCompletenessPercent(snapshot.percent)).toBe('100.000000');
  });

  it('clamps negative issue counts', () => {
    const items = buildCompletenessItems([
      { key: 'ap_anomalies', applicable: true, issueCount: -4 },
    ]);
    expect(items.find((item) => item.key === 'ap_anomalies')?.issueCount).toBe(0);
  });
});

describe('month-close period transitions', () => {
  it('allows open→ready→closed and ready→open demotion only', () => {
    expect(canTransitionMonthClose('open', 'ready')).toBe(true);
    expect(canTransitionMonthClose('ready', 'closed')).toBe(true);
    expect(canTransitionMonthClose('ready', 'open')).toBe(true);
    expect(canTransitionMonthClose('open', 'closed')).toBe(false);
    expect(canTransitionMonthClose('closed', 'open')).toBe(false);
    expect(canTransitionMonthClose('closed', 'ready')).toBe(false);
  });

  it('throws on illegal transitions', () => {
    expect(() => assertCanTransitionMonthClose('closed', 'open')).toThrow(DomainRuleError);
  });
});

describe('yearMonthBounds', () => {
  it('returns inclusive calendar bounds including leap February', () => {
    expect(yearMonthBounds('2026-03')).toEqual({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });
    expect(yearMonthBounds('2024-02')).toEqual({
      startDate: '2024-02-01',
      endDate: '2024-02-29',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';
import { buildRunningCashPosition } from '@/modules/financials/domain/running-cash-position';

const asOf = businessDate('2026-09-01');

describe('buildRunningCashPosition', () => {
  it('walks overdue through 90 days and leaves later and undated out of the balance', () => {
    const position = buildRunningCashPosition({
      opening: money('1000', 'ILS'),
      asOf,
      items: [
        { amount: money('200', 'ILS'), dueDate: businessDate('2026-08-01'), direction: 'in' },
        { amount: money('500', 'ILS'), dueDate: businessDate('2026-09-05'), direction: 'out' },
        { amount: money('100', 'ILS'), dueDate: businessDate('2026-09-20'), direction: 'in' },
        { amount: money('999', 'ILS'), dueDate: businessDate('2026-12-31'), direction: 'out' },
        { amount: money('50', 'ILS'), dueDate: null, direction: 'in' },
      ],
    });

    expect(position.steps.map((step) => step.key)).toEqual([
      'overdue',
      'next_7',
      'next_30',
      'next_60',
      'next_90',
    ]);
    expect(position.steps[0]?.running.amount).toBe('1200.000000');
    expect(position.steps[1]?.running.amount).toBe('700.000000');
    expect(position.steps[2]?.running.amount).toBe('800.000000');
    expect(position.expectedIn.amount).toBe('300.000000');
    expect(position.expectedOut.amount).toBe('500.000000');
    expect(position.endBalance.amount).toBe('800.000000');
    expect(position.lowestBalance.amount).toBe('700.000000');
    expect(position.excludedLaterCount).toBe(1);
    expect(position.excludedLaterOut.amount).toBe('999.000000');
    expect(position.excludedUndatedCount).toBe(1);
    expect(position.excludedUndatedIn.amount).toBe('50.000000');
  });

  it('treats the opening balance as the lowest point when later buckets only rise', () => {
    const position = buildRunningCashPosition({
      opening: money('100', 'ILS'),
      asOf,
      items: [
        { amount: money('40', 'ILS'), dueDate: businessDate('2026-09-03'), direction: 'in' },
      ],
    });

    expect(position.endBalance.amount).toBe('140.000000');
    expect(position.lowestBalance.amount).toBe('100.000000');
  });

  it('records a negative low point inside the walked horizon', () => {
    const position = buildRunningCashPosition({
      opening: money('100', 'ILS'),
      asOf,
      items: [
        { amount: money('250', 'ILS'), dueDate: businessDate('2026-08-15'), direction: 'out' },
      ],
    });

    expect(position.endBalance.amount).toBe('-150.000000');
    expect(position.lowestBalance.amount).toBe('-150.000000');
  });

  it('ignores items in another currency', () => {
    const position = buildRunningCashPosition({
      opening: money('10', 'ILS'),
      asOf,
      items: [
        { amount: money('80', 'USD'), dueDate: businessDate('2026-09-02'), direction: 'out' },
      ],
    });

    expect(position.endBalance.amount).toBe('10.000000');
    expect(position.expectedOut.amount).toBe('0.000000');
  });
});

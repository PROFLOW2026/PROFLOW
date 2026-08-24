import { describe, expect, it } from 'vitest';
import { DomainRuleError, ValidationError } from '@/shared/errors';
import {
  dayBeforeBusinessDate,
  firstBusinessDateOfYearMonth,
  listYearMonthsInclusive,
  resolveAmountForDate,
} from '@/modules/recurring-drafts/domain/amount-versions';
import { applyManagerialCostKindToExpensePayload } from '@/modules/recurring-drafts/domain/managerial-cost';

describe('resolveAmountForDate', () => {
  const versions = [
    {
      amount: '1000.00',
      currency: 'ILS',
      validFrom: '2026-01-01',
      validTo: '2026-03-31',
    },
    {
      amount: '1200.00',
      currency: 'ILS',
      validFrom: '2026-04-01',
      validTo: null,
    },
  ];

  it('returns the version covering the as-of date', () => {
    expect(resolveAmountForDate(versions, '2026-02-15', { amount: '999', currency: 'ILS' })).toEqual(
      {
        amount: '1000.00',
        currency: 'ILS',
        source: 'version',
      },
    );
    expect(resolveAmountForDate(versions, '2026-04-01', { amount: '999', currency: 'ILS' })).toEqual(
      {
        amount: '1200.00',
        currency: 'ILS',
        source: 'version',
      },
    );
  });

  it('falls back to payload amount when no version covers the date', () => {
    expect(
      resolveAmountForDate(versions, '2025-12-31', { amount: '800.00', currency: 'ils' }),
    ).toEqual({
      amount: '800.00',
      currency: 'ILS',
      source: 'payload_fallback',
    });
  });

  it('prefers the latest validFrom when windows overlap on the same day', () => {
    const overlapping = [
      {
        amount: '100',
        currency: 'ILS',
        validFrom: '2026-06-01',
        validTo: '2026-06-01',
      },
      {
        amount: '200',
        currency: 'ILS',
        validFrom: '2026-06-01',
        validTo: null,
      },
    ];
    expect(
      resolveAmountForDate(overlapping, '2026-06-01', { amount: '0', currency: 'ILS' }).amount,
    ).toBe('200');
  });
});

describe('listYearMonthsInclusive', () => {
  it('lists each month separately for retro backfill', () => {
    expect(listYearMonthsInclusive('2025-11', '2026-02')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('returns a single month when from equals to', () => {
    expect(listYearMonthsInclusive('2026-05', '2026-05')).toEqual(['2026-05']);
  });

  it('rejects inverted ranges', () => {
    expect(() => listYearMonthsInclusive('2026-06', '2026-01')).toThrow(ValidationError);
  });

  it('maps months to the first business date of that month', () => {
    expect(firstBusinessDateOfYearMonth('2026-03')).toBe('2026-03-01');
  });
});

describe('amount version rotation windows', () => {
  it('rotate Jan-Jun 8000 then Jul 9000 leaves first window intact', () => {
    // Simulates trusted-path sequence: open → close(valid_to) → insert new open version.
    const janOpen = {
      amount: '8000.00',
      currency: 'ILS',
      validFrom: '2026-01-01',
      validTo: null as string | null,
    };
    const junClose = dayBeforeBusinessDate('2026-07-01'); // 2026-06-30
    const closedJanJun = { ...janOpen, validTo: junClose };
    const julOpen = {
      amount: '9000.00',
      currency: 'ILS',
      validFrom: '2026-07-01',
      validTo: null,
    };
    const versions = [closedJanJun, julOpen];

    expect(resolveAmountForDate(versions, '2026-03-15', { amount: '0', currency: 'ILS' })).toEqual({
      amount: '8000.00',
      currency: 'ILS',
      source: 'version',
    });
    expect(resolveAmountForDate(versions, '2026-06-30', { amount: '0', currency: 'ILS' })).toEqual({
      amount: '8000.00',
      currency: 'ILS',
      source: 'version',
    });
    expect(resolveAmountForDate(versions, '2026-07-01', { amount: '0', currency: 'ILS' })).toEqual({
      amount: '9000.00',
      currency: 'ILS',
      source: 'version',
    });

    // Closing only sets valid_to — amount/valid_from unchanged (matches SQL history guard).
    expect(closedJanJun.amount).toBe(janOpen.amount);
    expect(closedJanJun.validFrom).toBe(janOpen.validFrom);
    expect(junClose).toBe('2026-06-30');
  });
});

describe('applyManagerialCostKindToExpensePayload', () => {
  it('clears project and sets business_overhead for general_business', () => {
    expect(
      applyManagerialCostKindToExpensePayload(
        {
          amount: '50',
          currency: 'ILS',
          projectId: '01900000-0000-7000-8000-0000000000aa',
          costFamily: 'direct_project',
        },
        'general_business',
      ),
    ).toEqual({
      amount: '50',
      currency: 'ILS',
      projectId: null,
      costFamily: 'business_overhead',
    });
  });

  it('requires projectId for direct_project', () => {
    expect(() =>
      applyManagerialCostKindToExpensePayload(
        { amount: '50', currency: 'ILS', projectId: null },
        'direct_project',
      ),
    ).toThrow(DomainRuleError);
  });
});

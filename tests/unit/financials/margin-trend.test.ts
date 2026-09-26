import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money';
import {
  decideMarginSnapshotWrite,
  marginSnapshotFromComposed,
  marginYearMonthKey,
  type ComposedMarginSource,
} from '@/modules/financials/domain/margin-trend';

const ILS = 'ILS';

function source(
  overrides: Partial<ComposedMarginSource> = {},
): ComposedMarginSource {
  return {
    currency: ILS,
    projectProfitabilityMode: 'direct',
    commercial: { currentContractValue: money('100000', ILS) },
    cost: {
      actualCostToDate: money('40000', ILS),
      directActualCostToDate: money('40000', ILS),
      fullActualCostToDate: money('45000', ILS),
      estimatedFinalCost: money('70000', ILS),
      directForecastFinalCost: money('70000', ILS),
      fullForecastFinalCost: money('82000', ILS),
    },
    profit: {
      actualProfit: money('60000', ILS),
      estimatedProfit: money('30000', ILS),
      actualMarginPercent: '60.00',
      marginPercent: '30.00',
    },
    ...overrides,
  };
}

describe('marginYearMonthKey', () => {
  const nearMonthBoundary = new Date('2026-04-01T00:30:00.000Z');

  it('uses the organization timezone calendar month', () => {
    expect(marginYearMonthKey('America/Los_Angeles', nearMonthBoundary)).toBe('2026-03');
    expect(marginYearMonthKey('UTC', nearMonthBoundary)).toBe('2026-04');
  });

  it('falls back to the UTC date when the timezone is missing or invalid', () => {
    expect(marginYearMonthKey(null, nearMonthBoundary)).toBe('2026-04');
    expect(marginYearMonthKey('   ', nearMonthBoundary)).toBe('2026-04');
    expect(marginYearMonthKey('Not/AZone', nearMonthBoundary)).toBe('2026-04');
  });
});

describe('decideMarginSnapshotWrite', () => {
  it('writes the current month when the period is open, ready, or missing', () => {
    expect(
      decideMarginSnapshotWrite({
        targetYearMonth: '2026-04',
        currentYearMonth: '2026-04',
        periodStatus: 'open',
      }),
    ).toEqual({ write: true, yearMonth: '2026-04' });
    expect(
      decideMarginSnapshotWrite({
        targetYearMonth: '2026-04',
        currentYearMonth: '2026-04',
        periodStatus: 'ready',
      }).write,
    ).toBe(true);
    expect(
      decideMarginSnapshotWrite({
        targetYearMonth: '2026-04',
        currentYearMonth: '2026-04',
        periodStatus: null,
      }).write,
    ).toBe(true);
  });

  it('does not write a closed current month', () => {
    expect(
      decideMarginSnapshotWrite({
        targetYearMonth: '2026-04',
        currentYearMonth: '2026-04',
        periodStatus: 'closed',
      }),
    ).toEqual({ write: false, reason: 'closed_period' });
  });

  it('never rewrites an older month, even when that period is still open', () => {
    expect(
      decideMarginSnapshotWrite({
        targetYearMonth: '2026-01',
        currentYearMonth: '2026-04',
        periodStatus: 'open',
      }),
    ).toEqual({ write: false, reason: 'not_current_month' });
    expect(
      decideMarginSnapshotWrite({
        targetYearMonth: '2026-01',
        currentYearMonth: '2026-04',
        periodStatus: 'closed',
      }),
    ).toEqual({ write: false, reason: 'not_current_month' });
  });

  it('refuses a month key that is not YYYY-MM', () => {
    expect(
      decideMarginSnapshotWrite({
        targetYearMonth: '2026-13',
        currentYearMonth: '2026-04',
        periodStatus: null,
      }),
    ).toEqual({ write: false, reason: 'invalid_month' });
  });
});

describe('marginSnapshotFromComposed', () => {
  it('copies composed direct cost and profit without recomputing margin', () => {
    const snapshot = marginSnapshotFromComposed(source());
    expect(snapshot).toEqual({
      currency: ILS,
      contractValue: money('100000', ILS).amount,
      actualCost: money('40000', ILS).amount,
      forecastCost: money('70000', ILS).amount,
      actualMargin: money('60000', ILS).amount,
      forecastMargin: money('30000', ILS).amount,
      actualMarginPercent: '60.00',
      forecastMarginPercent: '30.00',
    });
  });

  it('uses the full cost pair when profitability mode already includes general cost', () => {
    const snapshot = marginSnapshotFromComposed(
      source({ projectProfitabilityMode: 'include_general' }),
    );
    expect(snapshot?.actualCost).toBe(money('45000', ILS).amount);
    expect(snapshot?.forecastCost).toBe(money('82000', ILS).amount);
    expect(snapshot?.actualMargin).toBe(money('60000', ILS).amount);
  });

  it('keeps the direct pair for both-mode display', () => {
    const snapshot = marginSnapshotFromComposed(source({ projectProfitabilityMode: 'both' }));
    expect(snapshot?.actualCost).toBe(money('40000', ILS).amount);
    expect(snapshot?.forecastCost).toBe(money('70000', ILS).amount);
  });

  it('stores null margins when profit was not composed, and skips a missing contract', () => {
    const withoutProfit = marginSnapshotFromComposed(source({ profit: null }));
    expect(withoutProfit?.actualMargin).toBeNull();
    expect(withoutProfit?.forecastMargin).toBeNull();
    expect(withoutProfit?.contractValue).toBe(money('100000', ILS).amount);

    expect(marginSnapshotFromComposed(source({ commercial: null }))).toBeNull();
  });
});

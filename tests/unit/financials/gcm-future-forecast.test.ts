import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money';
import {
  computeDirectForecastFinalCost,
  computeFullForecastFinalCost,
} from '@/modules/financials/domain/cost-aggregation';

const ILS = 'ILS';

describe('future general cost forecast chain', () => {
  it('future general is excluded from direct forecast', () => {
    const direct = computeDirectForecastFinalCost({
      actualCostToDate: money('179900.94', ILS),
      remainingCommitments: money('0', ILS),
      expectedRemainingCost: money('0', ILS),
    });
    expect(Number(direct.amount)).toBeCloseTo(179900.94, 2);
  });

  it('future general enters full forecast exactly once', () => {
    const full = computeFullForecastFinalCost({
      actualCostToDate: money('179900.94', ILS),
      fullActualCostToDate: money('199316.31', ILS),
      remainingCommitments: money('0', ILS),
      expectedRemainingCost: money('0', ILS),
      futureGeneralAllocatedForecast: money('1363.64', ILS),
    });
    expect(Number(full.amount)).toBeCloseTo(200679.95, 2);
  });

  it('scheduled installments are not double-counted in forecast components', () => {
    const direct = computeDirectForecastFinalCost({
      actualCostToDate: money('100000', ILS),
      remainingCommitments: money('0', ILS),
      expectedRemainingCost: money('0', ILS),
    });
    const full = computeFullForecastFinalCost({
      actualCostToDate: money('100000', ILS),
      fullActualCostToDate: money('110000', ILS),
      remainingCommitments: money('0', ILS),
      expectedRemainingCost: money('0', ILS),
      futureGeneralAllocatedForecast: money('1363.64', ILS),
    });
    const delta = Number(full.amount) - Number(direct.amount);
    expect(delta).toBeCloseTo(11363.64, 2);
  });
});

describe('September activation (unit)', () => {
  it('September enters Actual only when through month is September', async () => {
    const { isYearMonthRecognizedForActual } = await import(
      '@/modules/financials/domain/general-cost-actual-recognition'
    );
    expect(isYearMonthRecognizedForActual('2026-09', '2026-08')).toBe(false);
    expect(isYearMonthRecognizedForActual('2026-09', '2026-09')).toBe(true);
    expect(isYearMonthRecognizedForActual('2026-10', '2026-09')).toBe(false);
  });
});

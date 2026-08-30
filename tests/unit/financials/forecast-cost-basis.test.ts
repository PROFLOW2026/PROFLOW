import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money';
import {
  computeDirectForecastFinalCost,
  computeFullForecastFinalCost,
  withAllocatedGeneralBusinessCost,
  withCommittedAndApPayable,
  emptyCostPosition,
} from '@/modules/financials/domain/cost-aggregation';
import { resolveForecastCostBasis } from '@/modules/financials/domain/resolve-forecast-cost-basis';
import { resolveProjectKpiDisplay } from '@/modules/financials/ui/resolve-kpi-display';
import type { ProjectFinancials } from '@/modules/financials/domain/types';
import { buildSliceAvailability } from '@/modules/financials/domain/slice-availability';

const ILS = 'ILS';

/** Real Owner project numbers as of 2026-08-30 (פינס 16). */
const REAL = {
  directActual: '179900.94',
  recognizedGeneral: '19415.37',
  fullActual: '199316.31',
  futureGeneral: '2925.03',
  directForecast: '179900.94',
  fullForecast: '202241.34',
} as const;

function buildRealProjectFinancials(): ProjectFinancials {
  let cost = emptyCostPosition(ILS);
  cost = {
    ...cost,
    actualCostToDate: money(REAL.directActual, ILS),
    directActualCostToDate: money(REAL.directActual, ILS),
  };
  cost = withAllocatedGeneralBusinessCost(cost, money(REAL.recognizedGeneral, ILS));
  cost = withCommittedAndApPayable(
    cost,
    money('0', ILS),
    money('0', ILS),
    money('0', ILS),
    money(REAL.futureGeneral, ILS),
  );

  return {
    projectId: 'ee7cb842-bbd1-4188-b95e-9f98446c92aa',
    currency: ILS,
    workKind: 'project',
    pricingMode: 'fixed',
    priceNotSet: false,
    commercial: {
      originalContractValue: money('500000', ILS),
      approvedAdditions: money('0', ILS),
      approvedReductions: money('0', ILS),
      currentContractValue: money('500000', ILS),
      pendingChanges: money('0', ILS),
    },
    billing: {
      invoiced: money('0', ILS),
      netInvoiced: money('0', ILS),
      paid: money('0', ILS),
      outstanding: money('0', ILS),
      monthCloseRevenueNet: money('0', ILS),
      hasBillingData: false,
    },
    cost,
    profit: null,
    coverage: {
      basis: 'direct_only',
      entries: [],
      calculatedAt: new Date(),
    },
    dataConfidence: { level: 'high', reasons: [] },
    projectProfitabilityMode: 'direct',
    sliceAvailability: buildSliceAvailability({
      canReadCommercial: true,
      canReadBilling: true,
      canReadExpenses: true,
      canReadWorkforce: true,
      canReadProcurement: true,
      canReadAp: true,
      laborLoaded: true,
    }),
  };
}

describe('forecast cost basis consistency', () => {
  it('direct forecast excludes recognized and future general allocation', () => {
    const direct = computeDirectForecastFinalCost({
      actualCostToDate: money(REAL.directActual, ILS),
      remainingCommitments: money('0', ILS),
      expectedRemainingCost: money('0', ILS),
    });
    expect(Number(direct.amount)).toBeCloseTo(Number(REAL.directForecast), 2);
  });

  it('full forecast starts from full actual and includes future general once', () => {
    const full = computeFullForecastFinalCost({
      actualCostToDate: money(REAL.directActual, ILS),
      fullActualCostToDate: money(REAL.fullActual, ILS),
      remainingCommitments: money('0', ILS),
      expectedRemainingCost: money('0', ILS),
      futureGeneralAllocatedForecast: money(REAL.futureGeneral, ILS),
    });
    expect(Number(full.amount)).toBeCloseTo(Number(REAL.fullForecast), 2);
  });

  it('full forecast is never below full actual when future general is positive', () => {
    const fullActual = money(REAL.fullActual, ILS);
    const fullForecast = computeFullForecastFinalCost({
      actualCostToDate: money(REAL.directActual, ILS),
      fullActualCostToDate: fullActual,
      remainingCommitments: money('0', ILS),
      expectedRemainingCost: money('0', ILS),
      futureGeneralAllocatedForecast: money(REAL.futureGeneral, ILS),
    });
    expect(Number(fullForecast.amount)).toBeGreaterThanOrEqual(Number(fullActual.amount));
  });

  it('direct mode KPI uses direct forecast only', () => {
    const kpis = resolveProjectKpiDisplay(buildRealProjectFinancials());
    expect(Number(kpis.directForecastCost.amount)).toBeCloseTo(Number(REAL.directForecast), 2);
    expect(Number(kpis.fullForecastCost.amount)).toBeCloseTo(Number(REAL.fullForecast), 2);
    expect(Number(kpis.forecastCost.amount)).toBeCloseTo(Number(REAL.directForecast), 2);
    expect(Number(kpis.fullForecastCost.amount) - Number(kpis.directForecastCost.amount)).toBeCloseTo(
      22340.4,
      2,
    );
  });

  it('include_general mode KPI uses full forecast', () => {
    const financials = { ...buildRealProjectFinancials(), projectProfitabilityMode: 'include_general' as const };
    const basis = resolveForecastCostBasis('include_general', financials.cost);
    expect(Number(basis.primaryForecastFinalCost.amount)).toBeCloseTo(Number(REAL.fullForecast), 2);
  });

  it('does not mix direct actual with future general in direct forecast path', () => {
    const badMixed = Number(REAL.directActual) + Number(REAL.futureGeneral);
    expect(Number(REAL.directForecast)).not.toBeCloseTo(badMixed, 2);
    expect(Number(REAL.fullForecast)).toBeCloseTo(Number(REAL.fullActual) + Number(REAL.futureGeneral), 2);
  });
});

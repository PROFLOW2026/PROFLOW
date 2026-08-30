import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { buildFinancialCoverage } from '@/modules/financials/domain/coverage';
import type { ProjectFinancials } from '@/modules/financials/domain/types';
import { ProjectFinancialsKpiPanel } from '@/modules/financials/ui/project-financials-kpi-panel';
import { MetricDrilldown } from '@/modules/financials/ui/metric-drilldown';
import {
  resolveProjectKpiDisplay,
  type ProjectFinancialsWithOptionalKpis,
} from '@/modules/financials/ui/resolve-kpi-display';
import { zeroMoney } from '@/shared/money';
import { buildSliceAvailability } from '@/modules/financials/domain/financial-slice-availability';
import { renderWithIntl } from './test-utils';

vi.mock('@/shared/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const allSlicesLoaded = buildSliceAvailability({
  canReadCommercial: true,
  canReadBilling: true,
  canReadExpenses: true,
  canReadWorkforce: true,
  canReadProcurement: true,
  canReadAp: true,
  laborLoaded: true,
});

function buildFinancials(overrides?: {
  overheadActual?: string;
  allocatedOverhead?: string;
  forecastCost?: string;
  expectedRemaining?: string;
  committed?: string;
  actualProfit?: string;
  estimatedProfit?: string;
}): ProjectFinancialsWithOptionalKpis {
  const currency = 'ILS';
  const zero = zeroMoney(currency);
  const actual = { amount: '25000.000000', currency };
  const etc = { amount: overrides?.expectedRemaining ?? '0.000000', currency };
  const committed = { amount: overrides?.committed ?? '0.000000', currency };
  const estimatedFinal =
    overrides?.forecastCost != null
      ? { amount: overrides.forecastCost, currency }
      : {
          amount: String(
            (
              Number(actual.amount) +
              Number(committed.amount) +
              Number(etc.amount)
            ).toFixed(6),
          ),
          currency,
        };

  const financials: ProjectFinancialsWithOptionalKpis = {
    projectId: 'project-1',
    currency,
    workKind: 'project',
    pricingMode: null,
    priceNotSet: false,
    commercial: {
      originalContractValue: { amount: '100000.000000', currency },
      approvedAdditions: zero,
      approvedReductions: zero,
      currentContractValue: { amount: '100000.000000', currency },
      pendingChanges: { amount: '5000.000000', currency },
    },
    billing: {
      invoiced: { amount: '40000.000000', currency },
      paid: { amount: '10000.000000', currency },
      outstanding: { amount: '30000.000000', currency },
      netInvoiced: { amount: '40000.000000', currency },
      hasBillingData: true,
      monthCloseRevenueNet: zero,
    },
    cost: {
      actualCostToDate: actual,
      estimatedFinalCost: estimatedFinal,
      byFamily: {
        directProject: { amount: '20000.000000', currency },
        shared: zero,
        businessOverhead: { amount: overrides?.overheadActual ?? '5000.000000', currency },
        assetCapital: zero,
      },
      laborActual: zero,
      vendorActual: zero,
      overheadActual: { amount: overrides?.overheadActual ?? '5000.000000', currency },
      committedOpen: committed,
      expectedRemainingCost: etc,
      openApPayable: { amount: '2000.000000', currency },
      monthCloseCostNet: zero,
      directActualCostToDate: actual,
      allocatedGeneralBusinessCost: zero,
      fullActualCostToDate: actual,
      futureGeneralAllocatedForecast: zero,
      directForecastFinalCost: estimatedFinal,
      fullForecastFinalCost: estimatedFinal,
      ...(overrides?.allocatedOverhead
        ? { allocatedOverhead: { amount: overrides.allocatedOverhead, currency } }
        : {}),
      ...(overrides?.forecastCost
        ? { forecastCost: { amount: overrides.forecastCost, currency } }
        : {}),
    },
    profit: {
      estimatedProfit: {
        amount: overrides?.estimatedProfit ?? '75000.000000',
        currency,
      },
      marginPercent: '75.00',
      actualProfit: {
        amount: overrides?.actualProfit ?? '75000.000000',
        currency,
      },
      actualMarginPercent: '75.00',
    },
    coverage: buildFinancialCoverage([{ source: 'direct_expenses', hasData: true }], new Date()),
    sliceAvailability: allSlicesLoaded,
    dataConfidence: { level: 'high', reasons: [] },
  };

  return financials;
}

describe('resolveProjectKpiDisplay', () => {
  it('consumes Agent 2 actualProfit / estimatedFinalCost fields', () => {
    const kpis = resolveProjectKpiDisplay(buildFinancials());
    expect(kpis.allocatedOverhead.amount).toBe('5000.000000');
    expect(kpis.forecastCost.amount).toBe('25000.000000');
    expect(kpis.forecastEqualsActual).toBe(true);
    expect(kpis.actualMargin?.amount).toBe('75000.000000');
    expect(kpis.forecastMargin?.amount).toBe('75000.000000');
    expect(kpis.actualMarginPercent).toBe('75.00');
  });

  it('prefers optional allocatedOverhead / forecastCost when present', () => {
    const kpis = resolveProjectKpiDisplay(
      buildFinancials({
        allocatedOverhead: '4500.000000',
        forecastCost: '30000.000000',
        expectedRemaining: '5000.000000',
        estimatedProfit: '70000.000000',
        actualProfit: '74000.000000',
      }),
    );
    expect(kpis.allocatedOverhead.amount).toBe('4500.000000');
    expect(kpis.forecastCost.amount).toBe('30000.000000');
    expect(kpis.forecastEqualsActual).toBe(false);
    expect(kpis.actualMargin?.amount).toBe('74000.000000');
    expect(kpis.forecastMargin?.amount).toBe('70000.000000');
  });
});

describe('MetricDrilldown', () => {
  it('expands breakdown lines and shows drill links', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <MetricDrilldown
        label="Actual Cost"
        value={{ amount: '25000.000000', currency: 'ILS' }}
        nature="Actual"
        explanation="Finalized costs only."
        lines={[{ label: 'Direct', value: { amount: '20000.000000', currency: 'ILS' } }]}
        links={[{ href: '/expenses?projectId=p1', label: 'View expenses' }]}
      />,
      { locale: 'en' },
    );

    expect(screen.queryByText('View expenses')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Actual Cost/i }));
    expect(screen.getByText('Finalized costs only.')).toBeInTheDocument();
    expect(screen.getByText('Direct')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View expenses' })).toHaveAttribute(
      'href',
      expect.stringContaining('/expenses'),
    );
  });
});

describe('ProjectFinancialsKpiPanel', () => {
  const t = (key: string) => key;

  it('drills Actual into original recognized + post-close correction + net', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ProjectFinancialsKpiPanel
        projectId="project-1"
        financials={
          {
            ...buildFinancials(),
            cost: {
              ...buildFinancials().cost,
              actualCostToDate: { amount: '29000.000000', currency: 'ILS' },
              monthCloseCostNet: { amount: '4000.000000', currency: 'ILS' },
            },
          } as ProjectFinancials
        }
        canReadProfit
        canReadBilling
        canReadCommercial
        t={t}
      />,
      { locale: 'en' },
    );

    await user.click(screen.getByRole('button', { name: /kpis.actualCost/i }));
    expect(screen.getAllByText('explain.whyThisNumber').length).toBeGreaterThan(0);
    expect(screen.getByText('kpis.recognizedOriginal')).toBeInTheDocument();
    expect(screen.getByText('kpis.monthCloseCost')).toBeInTheDocument();
    expect(screen.getByText('explain.formulas.actual')).toBeInTheDocument();
  });

  it('renders primary KPI labels', () => {
    renderWithIntl(
      <ProjectFinancialsKpiPanel
        projectId="project-1"
        financials={buildFinancials() as ProjectFinancials}
        canReadProfit
        canReadBilling
        canReadCommercial
        t={t}
      />,
      { locale: 'en' },
    );

    expect(screen.getByText('kpis.currentContract')).toBeInTheDocument();
    expect(screen.getByText('kpis.actualCost')).toBeInTheDocument();
    expect(screen.queryByText('kpis.allocatedOverhead')).not.toBeInTheDocument();
    expect(screen.getByText('kpis.committed')).toBeInTheDocument();
    expect(screen.getByText('kpis.forecast')).toBeInTheDocument();
    expect(screen.getByText('kpis.billed')).toBeInTheDocument();
    expect(screen.getByText('kpis.paid')).toBeInTheDocument();
    expect(screen.getByText('kpis.outstanding')).toBeInTheDocument();
    expect(screen.getByText('kpis.actualMargin')).toBeInTheDocument();
    expect(screen.getByText('kpis.forecastMargin')).toBeInTheDocument();
    expect(screen.getAllByText('kpis.billedHint').length).toBeGreaterThan(0);
    expect(screen.getAllByText('kpis.actualCostHint').length).toBeGreaterThan(0);
    expect(screen.getAllByText('kpis.outstandingHint').length).toBeGreaterThan(0);
    expect(screen.getAllByText('kpis.actualMarginHint').length).toBeGreaterThan(0);
  });

  it('shows allocated general KPI from pool allocation, not direct overheadActual', () => {
    const financials = buildFinancials({
      overheadActual: '0.000000',
    }) as ProjectFinancials;
    financials.cost.allocatedGeneralBusinessCost = {
      amount: '19415.370000',
      currency: 'ILS',
    };
    financials.cost.overheadActual = { amount: '0.000000', currency: 'ILS' };

    renderWithIntl(
      <ProjectFinancialsKpiPanel
        projectId="project-1"
        financials={financials}
        canReadProfit
        canReadBilling
        canReadCommercial
        t={t}
      />,
      { locale: 'en' },
    );

    expect(screen.getByText('kpis.allocatedOverhead')).toBeInTheDocument();
    expect(screen.queryByText('overheadActual')).not.toBeInTheDocument();
  });
});

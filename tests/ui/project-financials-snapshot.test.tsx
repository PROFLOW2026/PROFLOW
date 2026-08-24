import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectFinancialsSnapshotView } from '@/modules/financials/ui/project-financials-snapshot-view';
import { buildFinancialCoverage } from '@/modules/financials/domain/coverage';
import { buildSliceAvailability } from '@/modules/financials/domain/financial-slice-availability';
import type { ProjectFinancials } from '@/modules/financials/domain/types';
import { zeroMoney } from '@/shared/money';
import { renderWithIntl } from './test-utils';

function buildFinancials(): ProjectFinancials {
  const currency = 'ILS';
  const zero = zeroMoney(currency);

  return {
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
      pendingChanges: zero,
    },
    billing: {
      invoiced: zero,
      netInvoiced: zero,
      paid: zero,
      outstanding: zero,
      hasBillingData: false,
      monthCloseRevenueNet: zero,
    },
    cost: {
      actualCostToDate: { amount: '25000.000000', currency },
      estimatedFinalCost: { amount: '25000.000000', currency },
      byFamily: {
        directProject: { amount: '25000.000000', currency },
        shared: zero,
        businessOverhead: zero,
        assetCapital: zero,
      },
      laborActual: zero,
      vendorActual: zero,
      overheadActual: zero,
      committedOpen: zero,
      expectedRemainingCost: zero,
      openApPayable: zero,
      monthCloseCostNet: zero,
      directActualCostToDate: { amount: '25000.000000', currency },
      allocatedGeneralBusinessCost: zero,
      fullActualCostToDate: { amount: '25000.000000', currency },
    },
    profit: {
      estimatedProfit: { amount: '75000.000000', currency },
      marginPercent: '75',
      actualProfit: { amount: '75000.000000', currency },
      actualMarginPercent: '75',
    },
    coverage: buildFinancialCoverage(
      [{ source: 'direct_expenses', hasData: true }],
      new Date('2026-01-01'),
      [{ reason: 'foreign_currency_expenses_excluded', count: 1 }],
    ),
    sliceAvailability: buildSliceAvailability({
      canReadCommercial: true,
      canReadBilling: true,
      canReadExpenses: true,
      canReadWorkforce: true,
      canReadProcurement: true,
      canReadAp: true,
      laborLoaded: false,
    }),
    dataConfidence: {
      level: 'medium',
      reasons: ['foreign_currency_excluded'],
    },
  };
}

describe('ProjectFinancialsSnapshotView', () => {
  const t = (key: string) => {
    const labels: Record<string, string> = {
      'kpis.currentContract': 'Current Contract',
      'kpis.actualCost': 'Actual Cost',
      'kpis.allocatedOverhead': 'Allocated Overhead',
      'kpis.forecast': 'Cost forecast',
      'kpis.billingNotSetup': 'No billing records yet',
      'kpis.committed': 'Committed',
      'kpis.actualMargin': 'Actual Margin',
      'kpis.forecastMargin': 'Forecast Margin',
      'kpis.unavailable': 'Cannot calculate',
      actualCostToDate: 'Actual cost to date',
      estimatedProfit: 'Estimated profit',
      'confidence.title': 'Data confidence',
      'confidence.levels.medium': 'Medium',
      'confidence.levels.high': 'High',
      'confidence.levels.needs_data': 'Needs data',
      'confidence.highHint': 'No known incompleteness',
      'confidence.reasons.foreign_currency_excluded': 'FX excluded',
    };
    return labels[key] ?? key;
  };

  it('renders KPI labels with cost and margin figures', () => {
    renderWithIntl(
      <ProjectFinancialsSnapshotView financials={buildFinancials()} canReadProfit t={t} />,
    );

    expect(screen.getByText('Current Contract')).toBeInTheDocument();
    expect(screen.getByText('Actual Cost')).toBeInTheDocument();
    expect(screen.getByText('Cost forecast')).toBeInTheDocument();
    expect(screen.getByText('Committed')).toBeInTheDocument();
    expect(screen.getByText('No billing records yet')).toBeInTheDocument();
    expect(screen.getByText('Actual Margin')).toBeInTheDocument();
    expect(screen.getByText('Forecast Margin')).toBeInTheDocument();
    expect(screen.getAllByText(/25,000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/75,000/).length).toBeGreaterThan(0);
    expect(screen.queryByText('-')).not.toBeInTheDocument();
  });

  it('shows coverage disclosure when partials exist (B2)', () => {
    renderWithIntl(
      <ProjectFinancialsSnapshotView financials={buildFinancials()} canReadProfit t={t} />,
      { locale: 'en' },
    );

    expect(screen.getByText('What is included')).toBeInTheDocument();
  });

  it('hides margin KPIs when viewer lacks profit permission', () => {
    renderWithIntl(
      <ProjectFinancialsSnapshotView financials={buildFinancials()} canReadProfit={false} t={t} />,
    );

    expect(screen.getByText('Actual Cost')).toBeInTheDocument();
    expect(screen.queryByText('Actual Margin')).not.toBeInTheDocument();
    expect(screen.queryByText('Forecast Margin')).not.toBeInTheDocument();
  });
});

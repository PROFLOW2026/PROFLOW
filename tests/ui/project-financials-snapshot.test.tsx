import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectFinancialsSnapshotView } from '@/modules/financials/ui/project-financials-snapshot-view';
import { buildFinancialCoverage } from '@/modules/financials/domain/coverage';
import { zeroMoney } from '@/shared/money';
import { renderWithIntl } from './test-utils';

function buildFinancials() {
  const currency = 'ILS';
  const zero = zeroMoney(currency);

  return {
    projectId: 'project-1',
    currency,
    commercial: {
      originalContractValue: { amount: '100000.000000', currency },
      approvedAdditions: zero,
      approvedReductions: zero,
      currentContractValue: { amount: '100000.000000', currency },
      pendingChanges: zero,
    },
    billing: { invoiced: zero, paid: zero, outstanding: zero },
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
      openApPayable: zero,
    },
    profit: {
      estimatedProfit: { amount: '75000.000000', currency },
      marginPercent: '75',
    },
    coverage: buildFinancialCoverage(
      [{ source: 'direct_expenses', hasData: true }],
      new Date('2026-01-01'),
      [{ reason: 'foreign_currency_expenses_excluded', count: 1 }],
    ),
  };
}

describe('ProjectFinancialsSnapshotView', () => {
  const t = (key: string) => {
    const labels: Record<string, string> = {
      actualCostToDate: 'Actual cost to date',
      estimatedProfit: 'Estimated profit',
    };
    return labels[key] ?? key;
  };

  it('renders computed cost and profit instead of placeholder dashes (B2)', () => {
    renderWithIntl(
      <ProjectFinancialsSnapshotView financials={buildFinancials()} canReadProfit t={t} />,
    );

    expect(screen.getByText('Actual cost to date')).toBeInTheDocument();
    expect(screen.getByText('Estimated profit')).toBeInTheDocument();
    expect(screen.getByText(/25,000/)).toBeInTheDocument();
    expect(screen.getByText(/75,000/)).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('shows coverage disclosure when partials exist (B2)', () => {
    renderWithIntl(
      <ProjectFinancialsSnapshotView financials={buildFinancials()} canReadProfit t={t} />,
      { locale: 'en' },
    );

    expect(screen.getByText('What is included')).toBeInTheDocument();
  });

  it('hides profit when viewer lacks profit permission (B2)', () => {
    renderWithIntl(
      <ProjectFinancialsSnapshotView financials={buildFinancials()} canReadProfit={false} t={t} />,
    );

    expect(screen.getByText('Actual cost to date')).toBeInTheDocument();
    expect(screen.queryByText('Estimated profit')).not.toBeInTheDocument();
  });
});

import { fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import heFinancial from '@/locales/he-IL/financial.json';
import {
  buildProjectActualBreakdown,
  type ProjectActualAtom,
} from '@/modules/financials/domain/project-actual-breakdown';
import {
  ProjectActualBreakdownView,
  type OwnerStoryCopy,
} from '@/modules/financials/ui/project-actual-breakdown-view';
import { money } from '@/shared/money';
import { renderWithIntl } from './test-utils';

vi.mock('@/shared/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const ILS = 'ILS';

function ownerCopy(): OwnerStoryCopy {
  const o = heFinancial.ownerStory;
  return {
    title: o.title,
    currentContract: o.currentContract,
    actualCost: o.actualCost,
    ofWhich: o.ofWhich,
    allocatedGeneral: o.allocatedGeneral,
    openCommitments: o.openCommitments,
    forecastFinal: o.forecastFinal,
    billed: o.billed,
    collected: o.collected,
    actualProfit: o.actualProfit,
    afterGeneralProfit: o.afterGeneralProfit,
    forecastProfit: o.forecastProfit,
    unavailable: o.unavailable,
    breakdownTitle: o.breakdownTitle,
    categories: o.categories,
    total: o.total,
    percent: o.percent,
    sources: o.sources,
    expand: o.expand,
    collapse: o.collapse,
    hours: o.hours,
    workDays: o.workDays,
    missingCost: o.missingCost,
    ofLabor: o.ofLabor,
    period: o.period,
    forecastFormulaTitle: o.forecastFormulaTitle,
    forecastFormulaActual: o.forecastFormulaActual,
    forecastFormulaCommitments: o.forecastFormulaCommitments,
    forecastFormulaEtc: o.forecastFormulaEtc,
    forecastFormulaEquals: o.forecastFormulaEquals,
    profitFormulaTitle: o.profitFormulaTitle,
    profitFormulaContract: o.profitFormulaContract,
    profitFormulaForecast: o.profitFormulaForecast,
    profitFormulaEquals: o.profitFormulaEquals,
    openApCashNote: o.openApCashNote,
    actualLabel: o.actualLabel,
    commitmentLabel: o.commitmentLabel,
    paidLabel: o.paidLabel,
    openSource: o.openSource,
    subcontractGroupTotal: o.subcontractGroupTotal,
    overheadCategoryHint: o.overheadCategoryHint,
  };
}

describe('subcontractor drill-down reconciliation', () => {
  it('sums all atoms for the same contractor and lists each source', () => {
    const vendorId = 'vendor-totachim';
    const atoms: ProjectActualAtom[] = [
      {
        amount: money('30800.00', ILS),
        sourceKind: 'expense',
        sourceId: 'exp-1',
        vendorId,
        vendorName: 'התותחים',
        categoryKey: 'subcontractor',
        label: 'הוצאה — ינואר',
      },
      {
        amount: money('29700.00', ILS),
        sourceKind: 'ap_bill',
        sourceId: 'bill-1',
        vendorId,
        vendorName: 'התותחים',
        subcontractAgreementId: 'sa-1',
        label: 'חשבונית ספק — פברואר',
      },
    ];

    const breakdown = buildProjectActualBreakdown({
      totalActual: money('60500.00', ILS),
      atoms,
    });

    renderWithIntl(
      <ProjectActualBreakdownView
        breakdown={breakdown}
        laborByEmployee={null}
        copy={ownerCopy()}
        projectId="project-1"
      />,
      { locale: 'he-IL', messages: { financial: heFinancial } },
    );

    fireEvent.click(screen.getByRole('button', { name: /קבלני משנה/i }));

    const drillRoot = document.querySelector('[data-pf-subcontractor-drill]');
    expect(drillRoot).toBeTruthy();
    expect(screen.getByText('התותחים')).toBeInTheDocument();
    expect(drillRoot).toHaveTextContent('60,500');
    expect(screen.getByText('הוצאה — ינואר')).toBeInTheDocument();
    expect(screen.getByText('חשבונית ספק — פברואר')).toBeInTheDocument();
    expect(screen.getByText('30,800 ₪')).toBeInTheDocument();
    expect(screen.getByText('29,700 ₪')).toBeInTheDocument();
    expect(Number(breakdown.categories.find((c) => c.key === 'subcontractors')!.amount.amount)).toBe(
      60500,
    );
  });
});

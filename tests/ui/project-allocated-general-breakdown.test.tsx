import { fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import heFinancial from '@/locales/he-IL/financial.json';
import type { ProjectAllocatedGeneralDetail } from '@/modules/financials/domain/project-allocated-general-detail';
import {
  ProjectActualBreakdownView,
  type OwnerStoryCopy,
} from '@/modules/financials/ui/project-actual-breakdown-view';
import { buildProjectActualBreakdown } from '@/modules/financials/domain/project-actual-breakdown';
import { money } from '@/shared/money';
import { businessDate } from '@/shared/dates';
import { renderWithIntl } from './test-utils';

vi.mock('@/shared/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const ILS = 'ILS';

function ownerCopy(): OwnerStoryCopy {
  const o = heFinancial.ownerStory;
  const d = o.allocatedGeneralDetail;
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
    directActualCost: o.directActualCost,
    directBreakdownSectionTitle: o.directBreakdownSectionTitle,
    fullCostLayerTitle: o.fullCostLayerTitle,
    fullActualIncludingGeneral: o.fullActualIncludingGeneral,
    fullCostFormulaTitle: o.fullCostFormulaTitle,
    allocatedGeneralCompanyOnlyNote: o.allocatedGeneralCompanyOnlyNote,
    allocatedGeneralDetail: {
      expand: o.expand,
      collapse: o.collapse,
      expenseAmount: d.expenseAmount,
      allocatedToProject: d.allocatedToProject,
      poolWeightPercent: d.poolWeightPercent,
      informationalPercent: d.informationalPercent,
      monthBreakdownTitle: d.monthBreakdownTitle,
      supplier: d.supplier,
      method: d.method,
      poolOther: d.poolOther,
      openExpense: d.openExpense,
      sharedAcrossProjects: d.sharedAcrossProjects,
      methods: d.methods,
    },
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

const allocatedDetail: ProjectAllocatedGeneralDetail = {
  currency: ILS,
  totalAllocated: money('4900.94', ILS),
  detailSumDifference: money('0', ILS),
  reconciles: true,
  rows: [
    {
      id: 'exp-1',
      sourceKind: 'expense',
      expenseId: 'exp-insurance',
      expenseDate: businessDate('2026-01-15'),
      supplierName: 'כלל ביטוח',
      description: 'ביטוח עסקי',
      expenseGrossAmount: money('10000', ILS),
      allocatedAmount: money('2500', ILS),
      poolWeightPercent: '25.0',
      informationalPercent: null,
      yearMonth: '2026-01',
      allocationMethodKey: 'direct_actual_weight',
      allocationMethodLabel: 'לפי עלויות ישירות',
      costFamily: 'business_overhead',
      costCategoryKey: 'insurance',
      sharedProjectCount: 4,
      monthSlices: [],
    },
    {
      id: 'exp-2',
      sourceKind: 'expense',
      expenseId: 'exp-rent',
      expenseDate: businessDate('2026-02-01'),
      supplierName: 'משרדים בע״מ',
      description: 'שכירות משרד',
      expenseGrossAmount: money('8000', ILS),
      allocatedAmount: money('2400.94', ILS),
      poolWeightPercent: '30.0',
      informationalPercent: null,
      yearMonth: '2026-02',
      allocationMethodKey: 'direct_actual_weight',
      allocationMethodLabel: 'לפי עלויות ישירות',
      costFamily: 'business_overhead',
      costCategoryKey: 'rent',
      sharedProjectCount: 4,
      monthSlices: [],
    },
  ],
};

describe('allocated general breakdown drill-down', () => {
  it('shows expandable allocated-general row in direct mode with all sources', () => {
    const breakdown = buildProjectActualBreakdown({
      atoms: [],
      totalActual: money('175000', ILS),
    });

    renderWithIntl(
      <ProjectActualBreakdownView
        breakdown={breakdown}
        laborByEmployee={null}
        copy={ownerCopy()}
        projectId="proj-1"
        allocatedGeneral={{
          amount: money('4900.94', ILS),
          includeInBreakdownTotal: false,
          detail: allocatedDetail,
        }}
        costComposition={{
          directActual: money('175000', ILS),
          fullActual: money('179900.94', ILS),
        }}
      />,
    );

    const allocatedRow = document.querySelector('[data-pf-breakdown-allocated-general] button');
    expect(allocatedRow).toBeTruthy();
    expect(screen.queryByText('ביטוח עסקי')).not.toBeInTheDocument();

    fireEvent.click(allocatedRow!);

    expect(screen.getByText('ביטוח עסקי')).toBeInTheDocument();
    expect(screen.getByText('שכירות משרד')).toBeInTheDocument();
    expect(screen.getAllByText(/סכום ההוצאה/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/הוקצה לפרויקט/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/חלק הפרויקט בחלוקה:/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: 'פתיחת ההוצאה' })[0]).toHaveAttribute(
      'href',
      expect.stringContaining('exp-insurance'),
    );
    expect(document.querySelector('[data-pf-direct-subtotal]')).toBeInTheDocument();
    expect(document.querySelector('[data-pf-full-cost-layer]')).toBeInTheDocument();
    expect(document.querySelector('[data-pf-full-actual-total]')).toBeInTheDocument();
  });
});

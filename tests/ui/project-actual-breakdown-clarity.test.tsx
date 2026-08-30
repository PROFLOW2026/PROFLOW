import { screen } from '@testing-library/react';
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
    directActualCost: o.directActualCost,
    directBreakdownSectionTitle: o.directBreakdownSectionTitle,
    fullCostLayerTitle: o.fullCostLayerTitle,
    fullActualIncludingGeneral: o.fullActualIncludingGeneral,
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

describe('OWNER GATE — actual breakdown clarity', () => {
  it('hides zero overhead row and shows allocated general once with full actual total', () => {
    const atoms: ProjectActualAtom[] = [
      {
        amount: money('60500.00', ILS),
        sourceKind: 'ap_bill',
        sourceId: 'sub-1',
        vendorId: 'v-hatotahim',
        vendorName: 'התותחים',
        subcontractAgreementId: 'sa-1',
      },
      {
        amount: money('21450.00', ILS),
        sourceKind: 'expense',
        sourceId: 'exp-other',
        label: 'הוצאה אחרת',
        costFamily: 'direct_project',
        categoryKey: 'misc',
      },
    ];

    const breakdown = buildProjectActualBreakdown({
      totalActual: money('179900.94', ILS),
      atoms,
    });

    renderWithIntl(
      <ProjectActualBreakdownView
        breakdown={breakdown}
        laborByEmployee={null}
        copy={ownerCopy()}
        projectId="ee7cb842-bbd1-4188-b95e-9f98446c92aa"
        allocatedGeneral={{
          amount: money('19415.37', ILS),
          includeInBreakdownTotal: false,
          detail: {
            currency: ILS,
            totalAllocated: money('19415.37', ILS),
            detailSumDifference: money('0', ILS),
            reconciles: true,
            rows: [],
          },
        }}
        costComposition={{
          directActual: money('179900.94', ILS),
          fullActual: money('199316.31', ILS),
        }}
      />,
      { locale: 'he-IL', messages: { financial: heFinancial } },
    );

    expect(screen.queryByText('הוצאות כלליות')).not.toBeInTheDocument();
    expect(screen.getAllByText('הוצאות כלליות שהוקצו לפרויקט')).toHaveLength(1);
    expect(screen.getByText('עלות ישירה בפועל')).toBeInTheDocument();
    expect(screen.getByText('עלות מלאה בפועל')).toBeInTheDocument();
    expect(screen.getByText('תוספת לעלות מלאה')).toBeInTheDocument();
    expect(document.querySelector('[data-pf-direct-subtotal]')).toBeInTheDocument();
    expect(document.querySelector('[data-pf-full-actual-total]')).toBeInTheDocument();
  });
});

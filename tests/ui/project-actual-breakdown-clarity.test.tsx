import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import { buildProjectCostPaymentSummary } from '@/modules/financials/data/project-source-payment-detail.repository';
import type { ProjectSourcePaymentDetail } from '@/modules/financials/domain/project-source-payment-detail';
import { businessDate } from '@/shared/dates';
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
    openCommitmentsHint: o.openCommitmentsHint,
    sourcePayment: {
      recognizedOnProject: o.sourcePayment.recognizedOnProject,
      sourceNetTotal: o.sourcePayment.sourceNetTotal,
      sourceGrossTotal: o.sourcePayment.sourceGrossTotal,
      paidGross: o.sourcePayment.paidGross,
      remainingGross: o.sourcePayment.remainingGross,
      expenseDate: o.sourcePayment.expenseDate,
      dueDate: o.sourcePayment.dueDate,
      paymentStatus: o.sourcePayment.paymentStatus,
      projectShare: o.sourcePayment.projectShare,
      multiProjectNote: o.sourcePayment.multiProjectNote,
      netBasis: o.sourcePayment.netBasis,
      grossBasis: o.sourcePayment.grossBasis,
      paymentStatusLabels: o.sourcePayment.status,
    },
    costPaymentSummary: {
      title: o.costPaymentSummary.title,
      recognizedNet: o.costPaymentSummary.recognizedNet,
      paidGross: o.costPaymentSummary.paidGross,
      remainingGross: o.costPaymentSummary.remainingGross,
      apOutstanding: o.costPaymentSummary.apOutstanding,
      multiProjectHint: o.costPaymentSummary.multiProjectHint,
      laborPayrollHint: o.costPaymentSummary.laborPayrollHint,
      unavailable: o.unavailable,
    },
  };
}

function hatotahimPaymentDetail(projectNet: string, percent: string): ProjectSourcePaymentDetail {
  return {
    sourceKind: 'expense',
    sourceId: '71a725ef-e92e-4992-b063-b79bb490f042',
    vendorName: 'התותחים',
    categoryKey: 'subcontractor',
    expenseDate: businessDate('2026-08-31'),
    dueDate: businessDate('2026-10-15'),
    recognizedNetOnProject: money(projectNet, ILS),
    sourceNetTotal: money('39600', ILS),
    sourceGrossTotal: money('46728', ILS),
    paidGross: money('0', ILS),
    remainingGross: money('46728', ILS),
    paymentStatus: 'upcoming',
    projectSharePercent: percent,
    touchesMultipleProjects: true,
    projectTouchCount: 2,
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
    expect(screen.getByText('עלות ישירה מוכרת')).toBeInTheDocument();
    expect(screen.getByText('עלות מלאה מוכרת')).toBeInTheDocument();
    expect(screen.getByText('תוספת לעלות מלאה')).toBeInTheDocument();
    expect(document.querySelector('[data-pf-direct-subtotal]')).toBeInTheDocument();
    expect(document.querySelector('[data-pf-full-actual-total]')).toBeInTheDocument();
  });

  it('shows cost vs payment summary and subcontractor payment detail on expand', async () => {
    const atoms: ProjectActualAtom[] = [
      {
        amount: money('23760.00', ILS),
        sourceKind: 'expense',
        sourceId: '71a725ef-e92e-4992-b063-b79bb490f042',
        vendorId: 'v-hatotahim',
        vendorName: 'התותחים',
        costFamily: 'direct_project',
        categoryKey: 'subcontractor',
      },
    ];

    const breakdown = buildProjectActualBreakdown({
      totalActual: money('23760.00', ILS),
      atoms,
    });

    const sourcePaymentDetails = new Map([
      [
        '71a725ef-e92e-4992-b063-b79bb490f042',
        hatotahimPaymentDetail('23760.00', '60'),
      ],
    ]);

    const costPaymentSummary = buildProjectCostPaymentSummary({
      currency: ILS,
      recognizedNet: money('23760.00', ILS),
      apOutstandingGross: null,
      sourcePaidGross: money('0', ILS),
      sourceRemainingGross: money('46728', ILS),
      multiProjectSourceCount: 1,
      expenseSourceCount: 1,
    });

    renderWithIntl(
      <ProjectActualBreakdownView
        breakdown={breakdown}
        laborByEmployee={null}
        copy={ownerCopy()}
        projectId="proj-hor-gin"
        sourcePaymentDetails={sourcePaymentDetails}
        costPaymentSummary={costPaymentSummary}
      />,
      { locale: 'he-IL', messages: { financial: heFinancial } },
    );

    expect(screen.getByText('עלות מוכרת מול תשלום')).toBeInTheDocument();
    expect(screen.getByText(/46,728\.00/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /קבלני משנה/i }));

    const paymentDetail = document.querySelector('[data-pf-source-payment-detail]');
    expect(paymentDetail).toBeInTheDocument();
    expect(paymentDetail?.textContent).toContain('עלות מוכרת בפרויקט (נטו)');
    expect(paymentDetail?.textContent).toContain('חלוקה: 60% לפרויקט זה');
    expect(paymentDetail?.textContent).toContain('46,728.00');
    expect(paymentDetail?.textContent).toContain('צפוי לתשלום');
    expect(paymentDetail?.textContent).toContain('15 באוק');
  });
});

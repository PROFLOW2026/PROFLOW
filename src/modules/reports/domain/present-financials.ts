import type { ProjectFinancials } from '@/modules/financials/domain/types';
import { formatMoney, formatPercent } from '@/shared/money/format';
import type { ReportsCopy } from './copy';
import type { ReportOmitted, ReportSection } from './types';

export interface FinancialPresentation {
  readonly sections: readonly ReportSection[];
  readonly notices: readonly string[];
  readonly omitted: ReportOmitted;
}

/**
 * Shapes getProjectFinancials output for a report.
 * Never invents zeros for hidden profit. Never labels labor as compensation
 * unless the caller may read workforce cost.
 */
export function presentProjectFinancialSummary(
  financials: ProjectFinancials,
  input: {
    readonly copy: ReportsCopy;
    readonly locale: string;
    readonly canReadWorkforceCost: boolean;
  },
): FinancialPresentation {
  const { copy, locale, canReadWorkforceCost } = input;
  const sections: ReportSection[] = [];
  const notices: string[] = [
    copy.notices.actualCommittedForecast,
    copy.notices.billingNotPayment,
    copy.notices.vatNotProfit,
  ];
  const omitted: { profit?: boolean; compensation?: boolean; commercial?: boolean } = {};

  if (financials.commercial) {
    const c = financials.commercial;
    sections.push({
      id: 'commercial',
      heading: copy.sections.commercial,
      rows: [
        { label: copy.fields.originalContract, value: formatMoney(c.originalContractValue, locale), nature: 'commercial' },
        { label: copy.fields.approvedAdditions, value: formatMoney(c.approvedAdditions, locale), nature: 'commercial' },
        { label: copy.fields.approvedReductions, value: formatMoney(c.approvedReductions, locale), nature: 'commercial' },
        { label: copy.fields.currentContract, value: formatMoney(c.currentContractValue, locale), nature: 'commercial' },
        {
          label: copy.fields.pendingChanges,
          value: formatMoney(c.pendingChanges, locale),
          nature: 'estimate',
        },
      ],
      paragraphs: [copy.notices.pendingNotInContract],
    });
  } else {
    omitted.commercial = true;
    notices.push(copy.notices.commercialOmitted);
  }

  sections.push({
    id: 'billing',
    heading: copy.sections.billing,
    rows: [
      { label: copy.fields.invoiced, value: formatMoney(financials.billing.invoiced, locale), nature: 'cash' },
      { label: copy.fields.paid, value: formatMoney(financials.billing.paid, locale), nature: 'cash' },
      { label: copy.fields.outstanding, value: formatMoney(financials.billing.outstanding, locale), nature: 'cash' },
    ],
  });

  const costRows = [
    { label: copy.fields.actualCost, value: formatMoney(financials.cost.actualCostToDate, locale), nature: 'actual' as const },
    { label: copy.fields.committedOpen, value: formatMoney(financials.cost.committedOpen, locale), nature: 'committed' as const },
    {
      label: copy.fields.expectedRemaining,
      value: formatMoney(financials.cost.expectedRemainingCost, locale),
      nature: 'forecast' as const,
    },
    {
      label: copy.fields.forecastFinal,
      value: formatMoney(financials.cost.estimatedFinalCost, locale),
      nature: 'forecast' as const,
    },
    { label: copy.fields.openAp, value: formatMoney(financials.cost.openApPayable, locale), nature: 'cash' as const },
    { label: copy.fields.vendorActual, value: formatMoney(financials.cost.vendorActual, locale), nature: 'actual' as const },
  ];

  if (canReadWorkforceCost) {
    costRows.splice(1, 0, {
      label: copy.fields.laborActual,
      value: formatMoney(financials.cost.laborActual, locale),
      nature: 'actual',
    });
  } else {
    omitted.compensation = true;
    notices.push(copy.notices.compensationOmitted);
  }

  sections.push({
    id: 'cost',
    heading: copy.sections.cost,
    rows: costRows,
  });

  if (financials.profit) {
    const p = financials.profit;
    sections.push({
      id: 'profit',
      heading: copy.sections.profit,
      rows: [
        { label: copy.fields.actualProfit, value: formatMoney(p.actualProfit, locale), nature: 'actual' },
        {
          label: copy.fields.actualMargin,
          value: p.actualMarginPercent != null ? formatPercent(p.actualMarginPercent, locale) : '-',
          nature: 'actual',
        },
        { label: copy.fields.forecastProfit, value: formatMoney(p.estimatedProfit, locale), nature: 'forecast' },
        {
          label: copy.fields.forecastMargin,
          value: p.marginPercent != null ? formatPercent(p.marginPercent, locale) : '-',
          nature: 'forecast',
        },
      ],
    });
  } else {
    omitted.profit = true;
    notices.push(copy.notices.profitOmitted);
  }

  return { sections, notices, omitted };
}

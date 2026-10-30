import 'server-only';

import { reportDirection, resolveReportLocale } from '@/modules/reports/domain/copy';
import type { ReportPayload, ReportSection } from '@/modules/reports/domain/types';
import { formatMoney } from '@/shared/money/format';
import type { MoneyValue } from '@/shared/money';

export interface FinancialReportPayloadInput {
  readonly locale: string;
  readonly title: string;
  readonly companyName: string;
  readonly periodLabel?: string;
  readonly notices: readonly string[];
  readonly sections: readonly ReportSection[];
}

export function buildFinancialReportPayload(input: FinancialReportPayloadInput): ReportPayload {
  const locale = resolveReportLocale(input.locale);
  return {
    kind: 'portfolio_status',
    title: input.title,
    generatedAt: new Date().toISOString(),
    locale,
    dir: reportDirection(locale),
    identity: {
      companyName: input.companyName,
      projectId: null,
      projectName: null,
      projectNumber: null,
      clientName: null,
      extra: input.periodLabel ?? null,
    },
    notices: [...input.notices],
    sections: [...input.sections],
    omitted: {},
    brand: null,
  };
}

export function moneyCell(value: MoneyValue | null | undefined, locale: string): string {
  if (!value) return '—';
  return formatMoney(value, locale);
}

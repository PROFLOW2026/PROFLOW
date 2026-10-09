import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { reportDirection, reportTitle, resolveReportLocale, type ReportsCopy } from '../domain/copy';
import type { ReportPayload, ReportSection } from '../domain/types';
import { buildMonthlyWorkforceReport } from './generate-monthly-workforce-report';

type BuildCtx = {
  locale: string;
  copy: ReportsCopy;
  generatedAt: Date;
  companyName: string;
};

function parsePeriodId(id: string): { readonly year: number; readonly month: number | null } {
  const trimmed = id.trim();
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (monthMatch) {
    return { year: Number(monthMatch[1]), month: Number(monthMatch[2]) };
  }
  const yearMatch = /^(\d{4})$/.exec(trimmed);
  if (yearMatch) {
    return { year: Number(yearMatch[1]), month: null };
  }
  throw new Error('Invalid labor-by-period id (use YYYY or YYYY-MM)');
}

/** Org-pack labor rollup by calendar month(s) — RPT-001. */
export async function buildLaborByPeriodReport(
  context: OrgContext,
  periodId: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const { year, month } = parsePeriodId(periodId);
  const months =
    month != null
      ? [`${year}-${String(month).padStart(2, '0')}`]
      : Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);

  const sections: ReportSection[] = [];
  const notices = new Set<string>();

  for (const yearMonth of months) {
    const monthReport = await buildMonthlyWorkforceReport(context, yearMonth, ctx);
    sections.push(...monthReport.sections);
    for (const notice of monthReport.notices ?? []) {
      notices.add(notice);
    }
  }

  return {
    kind: 'labor_by_period',
    title: reportTitle(ctx.copy, 'labor_by_period'),
    generatedAt: ctx.generatedAt.toISOString(),
    locale: resolveReportLocale(ctx.locale),
    dir: reportDirection(ctx.locale),
    identity: {
      companyName: ctx.companyName,
      projectId: null,
      projectName: null,
      projectNumber: null,
      clientName: null,
      extra: periodId,
    },
    sections,
    notices: [...notices],
    omitted: {},
  };
}

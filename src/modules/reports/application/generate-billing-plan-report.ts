import { computeTaxAmountBreakdown, resolveApplicableDefaultTax } from '@/modules/tax';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate } from '@/shared/dates';
import { NotFoundError } from '@/shared/errors';
import { formatMoney, formatPercent } from '@/shared/money/format';
import {
  compareMoney,
  fromNumericString,
  isZeroMoney,
  money,
  subtractMoney,
  sumMoney,
  zeroMoney,
} from '@/shared/money';
import { reportDirection, resolveReportLocale, type getReportsCopy } from '../domain/copy';
import type { ReportKind, ReportPayload, ReportSection } from '../domain/types';
import {
  derivePercentFromAmount,
  getBillingCycleDetail,
  getBillingPlanDetail,
  listBillingPlansForProject,
  plannedCoveragePercent,
  type BillingCycleDocumentKind,
} from '@/modules/billing-plan';
import { findPlanById } from '@/modules/billing-plan/data/plans.repository';
import { findCycleById, listCyclesForPlan } from '@/modules/billing-plan/data/cycles.repository';
import { assertCanAccessProject, getProjectDetailChrome } from '@/modules/projects';

type BuildCtx = {
  locale: string;
  copy: ReturnType<typeof getReportsCopy>;
  generatedAt: Date;
  companyName: string;
};

function documentTitle(
  copy: ReturnType<typeof getReportsCopy>,
  documentKind: BillingCycleDocumentKind,
): string {
  const labels = copy.documentKinds;
  return labels[documentKind] ?? copy.kinds.project_billing_account;
}

/**
 * Resolves a cycle id, or the latest non-void cycle on a project's active plan
 * when `id` is a project id (project-scoped pack downloads).
 */
async function resolveCycleId(context: OrgContext, id: string): Promise<string> {
  const direct = await findCycleById(context.db, context.organizationId, id);
  if (direct) return direct.id;

  await assertCanAccessProject(context, id);
  const plans = await listBillingPlansForProject(context, { projectId: id });
  const plan =
    plans.find((row) => row.status === 'active') ??
    plans.find((row) => row.status === 'draft') ??
    plans[0];
  if (!plan) throw new NotFoundError('Billing plan');

  const cycles = await listCyclesForPlan(context.db, context.organizationId, plan.id);
  const cycle = [...cycles].reverse().find((row) => row.status !== 'void');
  if (!cycle) throw new NotFoundError('Billing cycle');
  return cycle.id;
}

export async function buildProjectBillingAccountReport(
  context: OrgContext,
  id: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const cycleId = await resolveCycleId(context, id);
  const detail = await getBillingCycleDetail(context, { cycleId });
  const chrome = await getProjectDetailChrome(context, detail.cycle.projectId);
  const currency = detail.plan.currency;
  const locale = resolveReportLocale(ctx.locale);

  const taxResolved = await resolveApplicableDefaultTax(
    context,
    businessDate(detail.cycle.accountDate),
  );
  const currentNet = fromNumericString(detail.totals.currentAmount, currency) ?? zeroMoney(currency);
  const taxBreakdown = computeTaxAmountBreakdown({
    enteredAmount: currentNet,
    currency,
    amountIncludesTax: false,
    resolved: taxResolved.resolved,
  });

  const priorParts = detail.lines.map((line) => money(line.priorAmount, currency));
  const cumulativeParts = detail.lines.map((line) => money(line.cumulativeAmount, currency));
  const priorTotal =
    priorParts.length === 0 ? zeroMoney(currency) : sumMoney(priorParts, currency);
  const cumulativeTotal =
    cumulativeParts.length === 0 ? zeroMoney(currency) : sumMoney(cumulativeParts, currency);
  const retentionTotal =
    fromNumericString(detail.totals.retentionAmount, currency) ?? zeroMoney(currency);

  const title = documentTitle(ctx.copy, detail.cycle.documentKind);

  const lineTableRows = detail.lines.map((line) => [
    line.label,
    formatMoney(money(line.priorAmount, currency), locale),
    formatMoney(money(line.currentAmount ?? '0', currency), locale),
    line.currentPercent ? formatPercent(line.currentPercent, locale) : '-',
    formatMoney(money(line.cumulativeAmount, currency), locale),
    formatMoney(money(line.remainingAmount, currency), locale),
    formatMoney(money(line.retentionAmount, currency), locale),
  ]);

  const sections: ReportSection[] = [
    {
      id: 'identity',
      heading: ctx.copy.sections.identity,
      rows: [
        {
          label: ctx.copy.fields.planName,
          value: detail.plan.name,
        },
        { label: ctx.copy.fields.title, value: detail.cycle.title },
        {
          label: ctx.copy.fields.cycleNumber,
          value: String(detail.cycle.cycleNumber),
        },
        {
          label: ctx.copy.fields.accountDate,
          value: detail.cycle.accountDate,
        },
        ...(detail.cycle.periodStart
          ? [{ label: ctx.copy.fields.periodStart, value: detail.cycle.periodStart }]
          : []),
        ...(detail.cycle.periodEnd
          ? [{ label: ctx.copy.fields.periodEnd, value: detail.cycle.periodEnd }]
          : []),
        {
          label: ctx.copy.identity.status,
          value: detail.cycle.status,
        },
        {
          label: ctx.copy.fields.kind,
          value: documentTitle(ctx.copy, detail.cycle.documentKind),
        },
      ],
    },
    {
      id: 'lines',
      heading: ctx.copy.sections.billingAccountLines,
      tables: [
        {
          headers: [
            ctx.copy.fields.item,
            ctx.copy.fields.priorBilled,
            ctx.copy.fields.currentAccount,
            ctx.copy.fields.percentComplete,
            ctx.copy.fields.cumulativeBilled,
            ctx.copy.fields.remaining,
            ctx.copy.fields.retentionHeld,
          ],
          rows: lineTableRows,
        },
      ],
    },
    {
      id: 'totals',
      heading: ctx.copy.sections.billingAccountTotals,
      rows: [
        {
          label: ctx.copy.fields.priorBilled,
          value: formatMoney(priorTotal, locale),
          nature: 'cash',
        },
        {
          label: ctx.copy.fields.currentAccount,
          value: formatMoney(currentNet, locale),
          nature: 'cash',
        },
        {
          label: ctx.copy.fields.cumulativeBilled,
          value: formatMoney(cumulativeTotal, locale),
          nature: 'cash',
        },
        {
          label: ctx.copy.fields.retentionHeld,
          value: formatMoney(retentionTotal, locale),
          nature: 'cash',
        },
        {
          label: ctx.copy.fields.tax,
          value: isZeroMoney(taxBreakdown.tax)
            ? '-'
            : formatMoney(taxBreakdown.tax, locale),
        },
        {
          label: ctx.copy.fields.total,
          value: formatMoney(taxBreakdown.gross, locale),
          nature: 'cash',
        },
      ],
      paragraphs: [ctx.copy.notices.notOfficialTaxInvoice, ctx.copy.notices.billingNotPayment],
    },
  ];

  return {
    kind: 'project_billing_account' satisfies ReportKind,
    title,
    generatedAt: ctx.generatedAt.toISOString(),
    locale,
    dir: reportDirection(ctx.locale),
    identity: {
      companyName: ctx.companyName,
      projectId: chrome.project.id,
      projectName: chrome.project.name,
      projectNumber: chrome.project.documentNumber,
      clientName: chrome.clientName,
      extra: detail.cycle.title,
    },
    notices: [
      ctx.copy.notices.notOfficialTaxInvoice,
      ctx.copy.notices.billingNotPayment,
      ctx.copy.notices.vatNotProfit,
      ctx.copy.snapshotNote,
    ],
    sections,
    omitted: {},
  };
}

/**
 * Resolves a plan id, or the preferred plan on a project when `id` is a project id.
 */
async function resolvePlanId(context: OrgContext, id: string): Promise<string> {
  const direct = await findPlanById(context.db, context.organizationId, id);
  if (direct) return direct.id;

  await assertCanAccessProject(context, id);
  const plans = await listBillingPlansForProject(context, { projectId: id });
  const plan =
    plans.find((row) => row.status === 'active') ??
    plans.find((row) => row.status === 'draft') ??
    plans[0];
  if (!plan) throw new NotFoundError('Billing plan');
  return plan.id;
}

/**
 * Consolidated project billing-plan analytics: schedule, billed vs planned,
 * unbilled contract, retention, next billing, and completion %.
 */
export async function buildProjectBillingPlanStatusReport(
  context: OrgContext,
  id: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const planId = await resolvePlanId(context, id);
  const detail = await getBillingPlanDetail(context, { planId });
  const chrome = await getProjectDetailChrome(context, detail.plan.projectId);
  const currency = detail.plan.currency;
  const locale = resolveReportLocale(ctx.locale);
  const recon = detail.reconciliation;

  const planned = fromNumericString(recon.plannedTotal, currency) ?? zeroMoney(currency);
  const billed = fromNumericString(recon.billedTotal, currency) ?? zeroMoney(currency);
  const remainingPlanned =
    fromNumericString(recon.remainingPlanned, currency) ?? zeroMoney(currency);
  const unplanned = fromNumericString(recon.unplannedAmount, currency) ?? zeroMoney(currency);
  const contractValue = fromNumericString(recon.contractValue, currency) ?? zeroMoney(currency);
  const retentionHeld =
    fromNumericString(detail.retentionHeldRemaining, currency) ?? zeroMoney(currency);
  const retentionAccumulated =
    fromNumericString(detail.retentionAccumulated, currency) ?? zeroMoney(currency);
  const retentionReleased =
    compareMoney(retentionAccumulated, retentionHeld) > 0
      ? subtractMoney(retentionAccumulated, retentionHeld)
      : zeroMoney(currency);

  const completionPct = derivePercentFromAmount(planned, billed);
  const coveragePct = plannedCoveragePercent(planned, contractValue);

  const lineById = new Map(detail.lines.map((line) => [line.id, line]));
  const scheduleRows = [...detail.lines]
    .filter((line) => !line.isArchived)
    .sort((a, b) => {
      const aDate = a.targetDate ?? '9999-12-31';
      const bDate = b.targetDate ?? '9999-12-31';
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return a.sortOrder - b.sortOrder;
    })
    .map((line) => {
      const progress = recon.lines.find((row) => row.planLineId === line.id);
      return [
        line.label,
        line.lineKind,
        line.targetDate ?? '-',
        formatMoney(money(line.agreedAmount, currency), locale),
        progress
          ? formatMoney(money(progress.billedAmount, currency), locale)
          : formatMoney(zeroMoney(currency), locale),
        progress ? formatPercent(progress.billedPercent, locale) : '-',
      ];
    });

  const billedVsPlannedRows = recon.lines.map((progress) => {
    const line = lineById.get(progress.planLineId);
    return [
      line?.label ?? progress.planLineId,
      formatMoney(money(progress.agreedAmount, currency), locale),
      formatMoney(money(progress.billedAmount, currency), locale),
      formatMoney(money(progress.remainingAmount, currency), locale),
      formatPercent(progress.billedPercent, locale),
    ];
  });

  const nextLine =
    detail.lines.find((line) => {
      if (line.isArchived) return false;
      const progress = recon.lines.find((row) => row.planLineId === line.id);
      if (!progress) return true;
      const remaining = fromNumericString(progress.remainingAmount, currency);
      return remaining != null && Number(remaining.amount) > 0;
    }) ?? null;
  const draftCycle = detail.cycles.find(
    (cycle) => cycle.status === 'draft' || cycle.status === 'ready',
  );
  const nextIssuedCandidate = [...detail.cycles]
    .filter((cycle) => cycle.status !== 'void')
    .sort((a, b) => a.cycleNumber - b.cycleNumber)[0];

  const sections: ReportSection[] = [
    {
      id: 'identity',
      heading: ctx.copy.sections.identity,
      rows: [
        { label: ctx.copy.fields.title, value: detail.plan.name },
        { label: ctx.copy.identity.status, value: detail.plan.status },
        {
          label: ctx.copy.fields.currentContract,
          value: formatMoney(contractValue, locale),
          nature: 'commercial',
        },
        {
          label: ctx.copy.fields.completionPercent,
          value: formatPercent(completionPct, locale),
        },
        {
          label: ctx.copy.fields.plannedCoverage,
          value: formatPercent(coveragePct, locale),
        },
      ],
    },
    {
      id: 'completion',
      heading: ctx.copy.sections.billingPlanCompletion,
      rows: [
        {
          label: ctx.copy.fields.plannedTotal,
          value: formatMoney(planned, locale),
          nature: 'commercial',
        },
        {
          label: ctx.copy.fields.billedTotal,
          value: formatMoney(billed, locale),
          nature: 'cash',
        },
        {
          label: ctx.copy.fields.completionPercent,
          value: formatPercent(completionPct, locale),
        },
      ],
    },
    {
      id: 'schedule',
      heading: ctx.copy.sections.billingPlanSchedule,
      tables: [
        {
          headers: [
            ctx.copy.fields.item,
            ctx.copy.fields.kind,
            ctx.copy.fields.dueDate,
            ctx.copy.fields.plannedAmount,
            ctx.copy.fields.billedTotal,
            ctx.copy.fields.percentComplete,
          ],
          rows: scheduleRows.length > 0 ? scheduleRows : [['-', '-', '-', '-', '-', '-']],
        },
      ],
      paragraphs:
        scheduleRows.length === 0 ? [ctx.copy.empty.billingPlanLines] : undefined,
    },
    {
      id: 'billed_vs_planned',
      heading: ctx.copy.sections.billingPlanBilledVsPlanned,
      tables: [
        {
          headers: [
            ctx.copy.fields.item,
            ctx.copy.fields.plannedAmount,
            ctx.copy.fields.billedTotal,
            ctx.copy.fields.remaining,
            ctx.copy.fields.percentComplete,
          ],
          rows:
            billedVsPlannedRows.length > 0
              ? billedVsPlannedRows
              : [['-', '-', '-', '-', '-']],
        },
      ],
    },
    {
      id: 'unbilled',
      heading: ctx.copy.sections.billingPlanUnbilled,
      rows: [
        {
          label: ctx.copy.fields.remainingPlanned,
          value: formatMoney(remainingPlanned, locale),
          nature: 'commercial',
        },
        {
          label: ctx.copy.fields.unplannedAmount,
          value: formatMoney(unplanned, locale),
          nature: 'commercial',
        },
        {
          label: ctx.copy.fields.currentContract,
          value: formatMoney(contractValue, locale),
          nature: 'commercial',
        },
      ],
      paragraphs: recon.overPlanned
        ? [ctx.copy.notices.billingPlanOverPlanned]
        : undefined,
    },
    {
      id: 'retention',
      heading: ctx.copy.sections.billingPlanRetention,
      rows: [
        {
          label: ctx.copy.fields.retentionHeld,
          value: formatMoney(retentionHeld, locale),
          nature: 'cash',
        },
        {
          label: ctx.copy.fields.retentionAccumulated,
          value: formatMoney(retentionAccumulated, locale),
          nature: 'cash',
        },
        {
          label: ctx.copy.fields.retentionReleased,
          value: formatMoney(retentionReleased, locale),
          nature: 'cash',
        },
      ],
    },
    {
      id: 'next_billing',
      heading: ctx.copy.sections.billingPlanNextBilling,
      rows: [
        {
          label: ctx.copy.fields.nextLine,
          value: nextLine
            ? [
                nextLine.label,
                nextLine.targetDate ?? null,
                nextLine.milestoneLabel ?? null,
              ]
                .filter(Boolean)
                .join(' · ')
            : '-',
        },
        {
          label: ctx.copy.fields.nextCycle,
          value: draftCycle
            ? `${draftCycle.title} (#${draftCycle.cycleNumber}) · ${draftCycle.status}`
            : nextIssuedCandidate
              ? `${nextIssuedCandidate.title} (#${nextIssuedCandidate.cycleNumber}) · ${nextIssuedCandidate.status}`
              : '-',
        },
        {
          label: ctx.copy.fields.accountDate,
          value: draftCycle?.accountDate ?? nextIssuedCandidate?.accountDate ?? '-',
        },
      ],
    },
  ];

  return {
    kind: 'project_billing_plan_status' satisfies ReportKind,
    title: ctx.copy.kinds.project_billing_plan_status,
    generatedAt: ctx.generatedAt.toISOString(),
    locale,
    dir: reportDirection(ctx.locale),
    identity: {
      companyName: ctx.companyName,
      projectId: chrome.project.id,
      projectName: chrome.project.name,
      projectNumber: chrome.project.documentNumber,
      clientName: chrome.clientName,
      extra: detail.plan.name,
    },
    notices: [
      ctx.copy.notices.billingNotPayment,
      ctx.copy.notices.vatNotProfit,
      ctx.copy.notices.billingPlanStatusSnapshot,
      ctx.copy.snapshotNote,
    ],
    sections,
    omitted: {},
  };
}

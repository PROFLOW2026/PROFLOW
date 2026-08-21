import { getBoqFinancialComparison, getFieldMeasureWorkspace, percentComplete } from '@/modules/boq';
import {
  getProjectCommercialSummary,
  listProjectChangeRequests,
} from '@/modules/commercial';
import { getEntityDocumentPanelData } from '@/modules/documents';
import {
  getDailyLogForOrg,
  getInspectionForOrg,
  getPunchListItemForOrg,
  getProjectFieldOpsSummary,
  listInspectionsForOrg,
  listPunchListItemsForOrg,
} from '@/modules/field-ops';
import { getProjectFinancials } from '@/modules/financials';
import {
  assertCanAccessProject,
  getProjectDetailChrome,
  type ProjectDetailChrome,
} from '@/modules/projects';
import { getQuoteById } from '@/modules/quotes';
import { getModuleVisibility } from '@/modules/tenancy';
import { listProjectSubcontracts, listProjectVendorEngagements } from '@/modules/vendors';
import { canReadWorkforceCost } from '@/modules/workforce';
import type { OrgContext } from '@/shared/auth/context';
import { nowUtc } from '@/shared/dates';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { formatMoney, formatPercent } from '@/shared/money/format';
import { fromNumericString, money } from '@/shared/money';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getReportsCopy, reportDirection, reportTitle, resolveReportLocale } from '../domain/copy';
import { assertReportKindPermission, isReportKind } from '../domain/kinds';
import { presentProjectFinancialSummary } from '../domain/present-financials';
import {
  DOCUMENT_NAME_CAP,
  type GenerateReportInput,
  type ReportIdentity,
  type ReportKind,
  type ReportPayload,
  type ReportRow,
  type ReportSection,
} from '../domain/types';
import { generateReportSchema } from '../validation/schemas';
import { buildExtendedReport } from './generate-extended-reports';

export const defaultReportDeps = {
  now: nowUtc,
  assertCanAccessProject,
  getProjectDetailChrome,
  getProjectFinancials,
  getModuleVisibility,
  getFieldMeasureWorkspace,
  getBoqFinancialComparison,
  listProjectChangeRequests,
  getProjectCommercialSummary,
  getQuoteById,
  getDailyLogForOrg,
  getEntityDocumentPanelData,
  getPunchListItemForOrg,
  getInspectionForOrg,
  listPunchListItemsForOrg,
  listInspectionsForOrg,
  listProjectVendorEngagements,
  listProjectSubcontracts,
  getProjectFieldOpsSummary,
};

export type ReportDeps = typeof defaultReportDeps;

function parseInput(raw: GenerateReportInput): { kind: ReportKind; id: string; locale: string } {
  const parsed = generateReportSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  if (!isReportKind(parsed.data.kind)) {
    throw new ValidationError([{ path: 'kind', message: 'Unknown report kind' }]);
  }
  return {
    kind: parsed.data.kind,
    id: parsed.data.id,
    locale: resolveReportLocale(parsed.data.locale),
  };
}

function identityFromChrome(companyName: string, chrome: ProjectDetailChrome): ReportIdentity {
  return {
    companyName,
    projectId: chrome.project.id,
    projectName: chrome.project.name,
    projectNumber: chrome.project.documentNumber,
    clientName: chrome.clientName,
  };
}

function formatInstant(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(value);
}

function formatDay(value: string | null | undefined, locale: string): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00Z`));
}

async function loadProjectChrome(
  context: OrgContext,
  projectId: string,
  deps: ReportDeps,
): Promise<ProjectDetailChrome> {
  await deps.assertCanAccessProject(context, projectId);
  return deps.getProjectDetailChrome(context, projectId);
}

function envelope(input: {
  kind: ReportKind;
  locale: string;
  generatedAt: Date;
  identity: ReportIdentity;
  sections: readonly ReportSection[];
  notices: readonly string[];
  omitted?: ReportPayload['omitted'];
}): ReportPayload {
  const copy = getReportsCopy(input.locale);
  return {
    kind: input.kind,
    title: reportTitle(copy, input.kind),
    generatedAt: input.generatedAt.toISOString(),
    locale: resolveReportLocale(input.locale),
    dir: reportDirection(input.locale),
    identity: input.identity,
    notices: input.notices,
    sections: input.sections,
    omitted: input.omitted ?? {},
  };
}

export async function generateReport(
  context: OrgContext,
  raw: GenerateReportInput,
  overrides: Partial<ReportDeps> = {},
): Promise<ReportPayload> {
  const deps = { ...defaultReportDeps, ...overrides };
  const { kind, id, locale } = parseInput({ ...raw, locale: raw.locale ?? context.locale });
  assertReportKindPermission(context, kind);
  const copy = getReportsCopy(locale);
  const generatedAt = deps.now();
  const companyName = context.organization.name;

  switch (kind) {
    case 'project_status':
      return buildProjectStatus(context, id, { locale, copy, generatedAt, companyName, deps });
    case 'project_financial_summary':
      return buildFinancialSummary(context, id, { locale, copy, generatedAt, companyName, deps });
    case 'boq_progress':
      return buildBoqProgress(context, id, { locale, copy, generatedAt, companyName, deps });
    case 'change_order_summary':
      return buildChangeOrders(context, id, { locale, copy, generatedAt, companyName, deps });
    case 'quote_estimate':
      return buildQuote(context, id, { locale, copy, generatedAt, companyName, deps });
    case 'field_daily':
      return buildDailyLog(context, id, { locale, copy, generatedAt, companyName, deps });
    case 'punch_inspection':
      return buildPunchInspection(context, id, { locale, copy, generatedAt, companyName, deps });
    case 'vendor_subcontract_summary':
      return buildVendors(context, id, { locale, copy, generatedAt, companyName, deps });
    default: {
      const extended = await buildExtendedReport(context, kind, id, {
        locale,
        copy,
        generatedAt,
        companyName,
      });
      if (extended) return extended;
      throw new ValidationError([{ path: 'kind', message: copy.errors.unknownKind }]);
    }
  }
}

type BuildCtx = {
  locale: string;
  copy: ReturnType<typeof getReportsCopy>;
  generatedAt: Date;
  companyName: string;
  deps: ReportDeps;
};

async function buildProjectStatus(
  context: OrgContext,
  projectId: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const chrome = await loadProjectChrome(context, projectId, ctx.deps);
  const p = chrome.project;
  const sections: ReportSection[] = [
    {
      id: 'status',
      heading: ctx.copy.sections.status,
      rows: [
        { label: ctx.copy.identity.status, value: p.status },
        { label: ctx.copy.identity.location, value: p.location ?? '-' },
        { label: ctx.copy.identity.startDate, value: formatDay(p.startDate, ctx.locale) },
        { label: ctx.copy.identity.targetEnd, value: formatDay(p.targetEndDate, ctx.locale) },
        { label: ctx.copy.identity.progress, value: p.progressPercent ? `${p.progressPercent}%` : '-' },
      ],
    },
  ];
  if (chrome.currentContractValue) {
    sections.push({
      id: 'commercial',
      heading: ctx.copy.sections.commercial,
      rows: [
        {
          label: ctx.copy.fields.currentContract,
          value: formatMoney(chrome.currentContractValue, ctx.locale),
          nature: 'commercial',
        },
      ],
      paragraphs: [ctx.copy.notices.pendingNotInContract],
    });
  }
  if (hasPermission(context, PERMISSIONS.FIELD_OPS_READ)) {
    const summary = await ctx.deps.getProjectFieldOpsSummary(context, projectId);
    sections.push({
      id: 'ops',
      heading: ctx.copy.sections.status,
      rows: [
        { label: ctx.copy.sections.punch, value: String(summary.openPunchCount) },
        {
          label: ctx.copy.fields.logDate,
          value: summary.latestLog ? formatDay(summary.latestLog.logDate, ctx.locale) : '-',
        },
      ],
    });
  }
  return envelope({
    kind: 'project_status',
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: identityFromChrome(ctx.companyName, chrome),
    sections,
    notices: [ctx.copy.snapshotNote],
  });
}

async function buildFinancialSummary(
  context: OrgContext,
  projectId: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const chrome = await loadProjectChrome(context, projectId, ctx.deps);
  const financials = await ctx.deps.getProjectFinancials(context, projectId);
  const presented = presentProjectFinancialSummary(financials, {
    copy: ctx.copy,
    locale: ctx.locale,
    canReadWorkforceCost: canReadWorkforceCost(context),
  });
  return envelope({
    kind: 'project_financial_summary',
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: identityFromChrome(ctx.companyName, chrome),
    sections: presented.sections,
    notices: presented.notices,
    omitted: presented.omitted,
  });
}

async function buildBoqProgress(
  context: OrgContext,
  projectId: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const modules = await ctx.deps.getModuleVisibility(context);
  if (!modules.boq) throw new NotFoundError('BOQ');
  const chrome = await loadProjectChrome(context, projectId, ctx.deps);
  const [measure, comparison] = await Promise.all([
    ctx.deps.getFieldMeasureWorkspace(context, projectId),
    ctx.deps.getBoqFinancialComparison(context, projectId),
  ]);
  const sections: ReportSection[] = [];
  const summaryRows: ReportRow[] = [
    {
      label: ctx.copy.fields.percentComplete,
      value:
        comparison.physicalProgressPercent != null
          ? formatPercent(comparison.physicalProgressPercent, ctx.locale)
          : '-',
    },
  ];
  if (comparison.actualCostToDate) {
    summaryRows.push({
      label: ctx.copy.fields.actualCost,
      value: formatMoney(comparison.actualCostToDate, ctx.locale),
      nature: 'actual' as const,
    });
  }
  if (comparison.estimatedFinalCost) {
    summaryRows.push({
      label: ctx.copy.fields.forecastFinal,
      value: formatMoney(comparison.estimatedFinalCost, ctx.locale),
      nature: 'forecast' as const,
    });
  }
  sections.push({
    id: 'boq-summary',
    heading: ctx.copy.sections.boq,
    rows: summaryRows,
    paragraphs: [ctx.copy.notices.progressNotActual],
  });

  if (measure.items.length === 0) {
    sections.push({
      id: 'boq-items',
      heading: ctx.copy.sections.boq,
      paragraphs: [ctx.copy.empty.boq],
    });
  } else {
    sections.push({
      id: 'boq-items',
      heading: ctx.copy.sections.boq,
      tables: [
        {
          headers: [
            ctx.copy.fields.item,
            ctx.copy.fields.description,
            ctx.copy.fields.quantity,
            ctx.copy.fields.performed,
            ctx.copy.fields.remaining,
            ctx.copy.fields.percentComplete,
          ],
          rows: measure.items.map((item) => {
            const pct = percentComplete({
              cumulativeApproved: item.performedQuantity,
              currentQuantity: item.currentQuantity,
            });
            return [
              item.itemCode ?? '',
              item.description,
              `${item.currentQuantity}${item.unit ? ` ${item.unit}` : ''}`,
              item.performedQuantity,
              item.remainingQuantity,
              formatPercent(pct, ctx.locale),
            ];
          }),
        },
      ],
    });
  }

  return envelope({
    kind: 'boq_progress',
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: identityFromChrome(ctx.companyName, chrome),
    sections,
    notices: [ctx.copy.notices.progressNotActual, ctx.copy.notices.actualCommittedForecast],
  });
}

async function buildChangeOrders(
  context: OrgContext,
  projectId: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const chrome = await loadProjectChrome(context, projectId, ctx.deps);
  const [items, commercial] = await Promise.all([
    ctx.deps.listProjectChangeRequests(context, projectId),
    ctx.deps.getProjectCommercialSummary(context, projectId),
  ]);
  const pendingStatuses = new Set(['draft', 'awaiting_approval']);
  const approved = items.filter((row) => row.status === 'approved');
  const pending = items.filter((row) => pendingStatuses.has(row.status));
  const sections: ReportSection[] = [];

  if (commercial) {
    sections.push({
      id: 'commercial',
      heading: ctx.copy.sections.commercial,
      rows: [
        {
          label: ctx.copy.fields.currentContract,
          value: formatMoney(commercial.position.currentContractValue, ctx.locale),
          nature: 'commercial',
        },
        {
          label: ctx.copy.fields.approvedAdditions,
          value: formatMoney(commercial.position.approvedAdditions, ctx.locale),
          nature: 'commercial',
        },
        {
          label: ctx.copy.fields.approvedReductions,
          value: formatMoney(commercial.position.approvedReductions, ctx.locale),
          nature: 'commercial',
        },
        {
          label: ctx.copy.fields.pendingChanges,
          value: formatMoney(commercial.position.pendingChanges, ctx.locale),
          nature: 'estimate',
        },
      ],
      paragraphs: [ctx.copy.notices.pendingNotInContract],
    });
  }

  const tableFor = (rows: typeof items) =>
    rows.map((row) => {
      const amount =
        fromNumericString(row.pricedAmount ?? row.requestedAmount, row.currency) ??
        money('0', row.currency);
      return [
        row.reference ?? row.id.slice(0, 8),
        row.title,
        row.status,
        row.direction,
        formatMoney(amount, ctx.locale),
      ];
    });

  sections.push({
    id: 'approved',
    heading: ctx.copy.sections.changesApproved,
    tables:
      approved.length > 0
        ? [
            {
              headers: [
                ctx.copy.fields.reference,
                ctx.copy.fields.title,
                ctx.copy.identity.status,
                ctx.copy.fields.direction,
                ctx.copy.fields.amount,
              ],
              rows: tableFor(approved),
            },
          ]
        : undefined,
    paragraphs: approved.length === 0 ? [ctx.copy.empty.changes] : undefined,
  });
  sections.push({
    id: 'pending',
    heading: ctx.copy.sections.changesPending,
    tables:
      pending.length > 0
        ? [
            {
              headers: [
                ctx.copy.fields.reference,
                ctx.copy.fields.title,
                ctx.copy.identity.status,
                ctx.copy.fields.direction,
                ctx.copy.fields.amount,
              ],
              rows: tableFor(pending),
            },
          ]
        : undefined,
    paragraphs: [ctx.copy.notices.pendingNotInContract],
  });

  return envelope({
    kind: 'change_order_summary',
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: identityFromChrome(ctx.companyName, chrome),
    sections,
    notices: [ctx.copy.notices.pendingNotInContract],
  });
}

async function buildQuote(
  context: OrgContext,
  quoteId: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const quote = await ctx.deps.getQuoteById(context, quoteId);
  if (quote.convertedProjectId) {
    await ctx.deps.assertCanAccessProject(context, quote.convertedProjectId);
  }
  const canProfit = hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ);
  const currency = quote.currency;
  const lineHeaders = [
    ctx.copy.fields.description,
    ctx.copy.fields.quantity,
    ctx.copy.fields.unit,
    ctx.copy.fields.unitPrice,
    ctx.copy.fields.lineTotal,
  ];
  const lineRows = quote.lines.map((line) => {
    const unitPrice = fromNumericString(line.unitPriceAmount, currency);
    const total = fromNumericString(line.lineTotalAmount, currency);
    return [
      line.description,
      line.quantity,
      line.unit ?? '',
      unitPrice ? formatMoney(unitPrice, ctx.locale) : line.unitPriceAmount,
      total ? formatMoney(total, ctx.locale) : (line.lineTotalAmount ?? ''),
    ];
  });
  const totalRows: ReportRow[] = [
    {
      label: ctx.copy.fields.subtotal,
      value: quote.subtotalAmount
        ? formatMoney(money(quote.subtotalAmount, currency), ctx.locale)
        : '-',
    },
    {
      label: ctx.copy.fields.tax,
      value: quote.taxAmount ? formatMoney(money(quote.taxAmount, currency), ctx.locale) : '-',
    },
    {
      label: ctx.copy.fields.total,
      value: quote.totalAmount ? formatMoney(money(quote.totalAmount, currency), ctx.locale) : '-',
    },
  ];
  if (canProfit && quote.estimatedCostAmount) {
    totalRows.splice(1, 0, {
      label: ctx.copy.fields.estimatedCost,
      value: formatMoney(money(quote.estimatedCostAmount, currency), ctx.locale),
      nature: 'estimate' as const,
    });
    if (quote.estimatedMarginPercent) {
      totalRows.splice(2, 0, {
        label: ctx.copy.fields.estimatedMargin,
        value: formatPercent(quote.estimatedMarginPercent, ctx.locale),
        nature: 'estimate' as const,
      });
    }
  }
  const omitted = canProfit ? {} : { profit: true as const };
  return envelope({
    kind: 'quote_estimate',
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: {
      companyName: ctx.companyName,
      projectId: quote.convertedProjectId,
      projectName: quote.title,
      projectNumber: null,
      clientName: quote.clientName,
      extra: quote.title,
    },
    sections: [
      {
        id: 'lines',
        heading: ctx.copy.sections.quoteLines,
        tables:
          lineRows.length > 0
            ? [{ headers: lineHeaders, rows: lineRows }]
            : undefined,
        paragraphs: lineRows.length === 0 ? [ctx.copy.empty.lines] : [ctx.copy.notices.quoteNotBilling],
      },
      {
        id: 'totals',
        heading: ctx.copy.sections.quoteTotals,
        rows: totalRows,
        paragraphs: [ctx.copy.notices.vatNotProfit, ctx.copy.notices.quoteNotBilling],
      },
    ],
    notices: [ctx.copy.notices.quoteNotBilling, ctx.copy.notices.vatNotProfit],
    omitted,
  });
}

async function buildDailyLog(
  context: OrgContext,
  logId: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const log = await ctx.deps.getDailyLogForOrg(context, logId);
  const chrome = await loadProjectChrome(context, log.projectId, ctx.deps);
  const docs = hasPermission(context, PERMISSIONS.DOCUMENTS_READ)
    ? await ctx.deps.getEntityDocumentPanelData(context, 'daily_log', log.id)
    : { documents: [] as Awaited<ReturnType<ReportDeps['getEntityDocumentPanelData']>>['documents'] };
  const named = docs.documents.slice(0, DOCUMENT_NAME_CAP).map((doc) => [
    doc.originalFilename,
    doc.label ?? '',
  ]);
  const sections: ReportSection[] = [
    {
      id: 'log',
      heading: ctx.copy.sections.dailyLog,
      rows: [
        { label: ctx.copy.fields.logDate, value: formatDay(log.logDate, ctx.locale) },
        { label: ctx.copy.identity.status, value: log.status },
        { label: ctx.copy.fields.weather, value: log.weather ?? '-' },
        { label: ctx.copy.fields.summary, value: log.summary },
        { label: ctx.copy.fields.workPerformed, value: log.workPerformed ?? '-' },
        { label: ctx.copy.fields.workforceNotes, value: log.workforceNotes ?? '-' },
        { label: ctx.copy.fields.blockers, value: log.blockers ?? '-' },
        { label: ctx.copy.fields.workersOnSite, value: log.workersOnSite ?? '-' },
        { label: ctx.copy.fields.subcontractorsOnSite, value: log.subcontractorsOnSite ?? '-' },
        { label: ctx.copy.fields.equipment, value: log.equipmentOnSite ?? '-' },
        { label: ctx.copy.fields.deliveries, value: log.deliveries ?? '-' },
        { label: ctx.copy.fields.delays, value: log.delays ?? '-' },
        { label: ctx.copy.fields.incidents, value: log.incidents ?? '-' },
        { label: ctx.copy.fields.safetyNotes, value: log.safetyNotes ?? '-' },
      ],
    },
    {
      id: 'photos',
      heading: ctx.copy.sections.photos,
      tables:
        named.length > 0
          ? [{ headers: [ctx.copy.fields.filename, ctx.copy.fields.caption], rows: named }]
          : undefined,
      paragraphs: [ctx.copy.notices.photosCapped, ...(named.length === 0 ? [ctx.copy.empty.photos] : [])],
    },
  ];
  return envelope({
    kind: 'field_daily',
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: identityFromChrome(ctx.companyName, chrome),
    sections,
    notices: [ctx.copy.notices.photosCapped],
  });
}

async function buildPunchInspection(
  context: OrgContext,
  id: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const punch = await ctx.deps.getPunchListItemForOrg(context, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) return null;
    throw error;
  });
  if (punch) {
    const chrome = await loadProjectChrome(context, punch.projectId, ctx.deps);
    const docs = hasPermission(context, PERMISSIONS.DOCUMENTS_READ)
      ? await ctx.deps.getEntityDocumentPanelData(context, 'punch_list_item', punch.id)
      : { documents: [] as Awaited<ReturnType<ReportDeps['getEntityDocumentPanelData']>>['documents'] };
    return envelope({
      kind: 'punch_inspection',
      locale: ctx.locale,
      generatedAt: ctx.generatedAt,
      identity: identityFromChrome(ctx.companyName, chrome),
      sections: [
        {
          id: 'punch',
          heading: ctx.copy.sections.punch,
          rows: [
            { label: ctx.copy.fields.title, value: punch.title },
            { label: ctx.copy.identity.status, value: punch.status },
            { label: ctx.copy.fields.priority, value: punch.priority },
            { label: ctx.copy.fields.location, value: punch.location ?? '-' },
            { label: ctx.copy.fields.dueDate, value: formatDay(punch.dueDate, ctx.locale) },
            { label: ctx.copy.fields.description, value: punch.description ?? '-' },
          ],
        },
        documentNameSection(ctx.copy, docs.documents),
      ],
      notices: [ctx.copy.notices.photosCapped],
    });
  }

  const inspection = await ctx.deps.getInspectionForOrg(context, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) return null;
    throw error;
  });
  if (inspection) {
    const chrome = await loadProjectChrome(context, inspection.projectId, ctx.deps);
    const docs = hasPermission(context, PERMISSIONS.DOCUMENTS_READ)
      ? await ctx.deps.getEntityDocumentPanelData(context, 'inspection', inspection.id)
      : { documents: [] as Awaited<ReturnType<ReportDeps['getEntityDocumentPanelData']>>['documents'] };
    return envelope({
      kind: 'punch_inspection',
      locale: ctx.locale,
      generatedAt: ctx.generatedAt,
      identity: identityFromChrome(ctx.companyName, chrome),
      sections: [
        {
          id: 'inspection',
          heading: ctx.copy.sections.inspections,
          rows: [
            { label: ctx.copy.fields.title, value: inspection.title },
            { label: ctx.copy.fields.kind, value: inspection.kind },
            { label: ctx.copy.identity.status, value: inspection.status },
            { label: ctx.copy.fields.scheduledOn, value: formatDay(inspection.scheduledOn, ctx.locale) },
            { label: ctx.copy.fields.completedOn, value: formatDay(inspection.completedOn, ctx.locale) },
            { label: ctx.copy.fields.result, value: inspection.result ?? '-' },
            { label: ctx.copy.fields.description, value: inspection.notes ?? '-' },
          ],
        },
        documentNameSection(ctx.copy, docs.documents),
      ],
      notices: [ctx.copy.notices.photosCapped],
    });
  }

  const chrome = await loadProjectChrome(context, id, ctx.deps);
  const [punches, inspections] = await Promise.all([
    ctx.deps.listPunchListItemsForOrg(context, { projectId: id }),
    ctx.deps.listInspectionsForOrg(context, { projectId: id }),
  ]);
  return envelope({
    kind: 'punch_inspection',
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: identityFromChrome(ctx.companyName, chrome),
    sections: [
      {
        id: 'punch',
        heading: ctx.copy.sections.punch,
        tables:
          punches.length > 0
            ? [
                {
                  headers: [
                    ctx.copy.fields.title,
                    ctx.copy.identity.status,
                    ctx.copy.fields.priority,
                    ctx.copy.fields.dueDate,
                  ],
                  rows: punches.map((item) => [
                    item.title,
                    item.status,
                    item.priority,
                    formatDay(item.dueDate, ctx.locale),
                  ]),
                },
              ]
            : undefined,
        paragraphs: punches.length === 0 ? [ctx.copy.empty.punch] : undefined,
      },
      {
        id: 'inspections',
        heading: ctx.copy.sections.inspections,
        tables:
          inspections.length > 0
            ? [
                {
                  headers: [
                    ctx.copy.fields.title,
                    ctx.copy.fields.kind,
                    ctx.copy.identity.status,
                    ctx.copy.fields.scheduledOn,
                  ],
                  rows: inspections.map((item) => [
                    item.title,
                    item.kind,
                    item.status,
                    formatDay(item.scheduledOn, ctx.locale),
                  ]),
                },
              ]
            : undefined,
        paragraphs: inspections.length === 0 ? [ctx.copy.empty.inspections] : undefined,
      },
    ],
    notices: [],
  });
}

async function buildVendors(
  context: OrgContext,
  projectId: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const chrome = await loadProjectChrome(context, projectId, ctx.deps);
  const [engagements, agreements] = await Promise.all([
    ctx.deps.listProjectVendorEngagements(context, projectId),
    ctx.deps.listProjectSubcontracts(context, projectId),
  ]);
  return envelope({
    kind: 'vendor_subcontract_summary',
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: identityFromChrome(ctx.companyName, chrome),
    sections: [
      {
        id: 'vendors',
        heading: ctx.copy.sections.vendors,
        tables:
          engagements.length > 0
            ? [
                {
                  headers: [ctx.copy.fields.vendor, ctx.copy.identity.status],
                  rows: engagements.map((row) => [row.vendorName, row.status]),
                },
              ]
            : undefined,
        paragraphs: engagements.length === 0 ? [ctx.copy.empty.vendors] : undefined,
      },
      {
        id: 'subcontracts',
        heading: ctx.copy.sections.subcontracts,
        tables:
          agreements.length > 0
            ? [
                {
                  headers: [
                    ctx.copy.fields.agreement,
                    ctx.copy.fields.vendor,
                    ctx.copy.identity.status,
                    ctx.copy.fields.currentValue,
                    ctx.copy.fields.billed,
                    ctx.copy.fields.paidCash,
                  ],
                  rows: agreements.map((row) => [
                    row.title,
                    row.vendorName,
                    row.status,
                    formatMoney(money(row.currentAmount, row.currency), ctx.locale),
                    formatMoney(money(row.billedAmount, row.currency), ctx.locale),
                    formatMoney(money(row.paidAmount, row.currency), ctx.locale),
                  ]),
                },
              ]
            : undefined,
        paragraphs:
          agreements.length === 0
            ? [ctx.copy.empty.subcontracts]
            : [ctx.copy.notices.billingNotPayment, ctx.copy.notices.actualCommittedForecast],
      },
    ],
    notices: [ctx.copy.notices.billingNotPayment],
  });
}

function documentNameSection(
  copy: ReturnType<typeof getReportsCopy>,
  documents: readonly { originalFilename: string; label: string | null }[],
): ReportSection {
  const named = documents.slice(0, DOCUMENT_NAME_CAP).map((doc) => [doc.originalFilename, doc.label ?? '']);
  return {
    id: 'photos',
    heading: copy.sections.photos,
    tables:
      named.length > 0
        ? [{ headers: [copy.fields.filename, copy.fields.caption], rows: named }]
        : undefined,
    paragraphs: [copy.notices.photosCapped, ...(named.length === 0 ? [copy.empty.photos] : [])],
  };
}

export function formatReportGeneratedAt(generatedAtIso: string, locale: string): string {
  return formatInstant(new Date(generatedAtIso), locale);
}

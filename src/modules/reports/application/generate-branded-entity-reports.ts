import 'server-only';

import { getClientById, getClientFinancials } from '@/modules/clients';
import { getPurchaseOrderById, getRfqDetail } from '@/modules/procurement';
import { findContractById, getProjectDetailChrome } from '@/modules/projects';
import { getWorkOrderDetail } from '@/modules/service';
import { getTimesheetDetail } from '@/modules/workforce';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { formatMoney } from '@/shared/money/format';
import { money } from '@/shared/money';
import {
  getReportsCopy,
  reportDirection,
  reportTitle,
  resolveReportLocale,
} from '../domain/copy';
import { localizeCode } from '@/shared/i18n/code-display';
import type { ReportKind, ReportPayload, ReportSection } from '../domain/types';

type BuildCtx = {
  locale: string;
  copy: ReturnType<typeof getReportsCopy>;
  generatedAt: Date;
  companyName: string;
};

function envelope(input: {
  kind: ReportKind;
  locale: string;
  generatedAt: Date;
  identity: ReportPayload['identity'];
  sections: readonly ReportSection[];
  notices: readonly string[];
}): ReportPayload {
  return {
    kind: input.kind,
    title: reportTitle(getReportsCopy(input.locale), input.kind),
    generatedAt: input.generatedAt.toISOString(),
    locale: resolveReportLocale(input.locale),
    dir: reportDirection(input.locale),
    identity: input.identity,
    notices: input.notices,
    sections: input.sections,
    omitted: {},
  };
}

export async function buildPurchaseOrderReport(
  context: OrgContext,
  purchaseOrderId: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const detail = await getPurchaseOrderById(context, purchaseOrderId);
  if (!detail) throw new NotFoundError('Purchase order');
  const po = detail.order;
  const currency = po.currency;
  const lineRows = detail.lines.map((line) => [
    line.description,
    line.quantity,
    formatMoney(money(line.unitAmount, currency), ctx.locale),
    formatMoney(money(line.lineTotal, currency), ctx.locale),
  ]);

  return envelope({
    kind: 'purchase_order',
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: {
      companyName: ctx.companyName,
      projectId: po.projectId,
      projectName: null,
      projectNumber: po.reference ?? null,
      clientName: null,
      extra: po.reference ?? po.id,
    },
    sections: [
      {
        id: 'po',
        heading: ctx.copy.sections.identity,
        rows: [
          { label: ctx.copy.identity.status, value: localizeCode(ctx.locale, po.status) },
          { label: ctx.copy.fields.vendor, value: po.vendorId },
          {
            label: ctx.copy.fields.total,
            value: formatMoney(money(po.committedAmount, currency), ctx.locale),
            nature: 'committed',
          },
        ],
      },
      {
        id: 'lines',
        heading: ctx.copy.sections.quoteLines,
        tables:
          lineRows.length > 0
            ? [
                {
                  headers: [
                    ctx.copy.fields.description,
                    ctx.copy.fields.quantity,
                    ctx.copy.fields.unitPrice,
                    ctx.copy.fields.lineTotal,
                  ],
                  rows: lineRows,
                },
              ]
            : undefined,
        paragraphs: lineRows.length === 0 ? [ctx.copy.empty.lines] : undefined,
      },
    ],
    notices: [ctx.copy.snapshotNote],
  });
}

export async function buildProcurementRfqReport(
  context: OrgContext,
  rfqId: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const detail = await getRfqDetail(context, rfqId);
  if (!detail) throw new NotFoundError('RFQ');
  const { rfq, lines } = detail;
  const lineRows = lines.map((line) => [
    line.description,
    line.quantity,
    line.unit ?? '',
  ]);

  return envelope({
    kind: 'procurement_rfq',
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: {
      companyName: ctx.companyName,
      projectId: rfq.projectId,
      projectName: null,
      projectNumber: null,
      clientName: null,
      extra: rfq.title,
    },
    sections: [
      {
        id: 'rfq',
        heading: ctx.copy.sections.identity,
        rows: [
          { label: ctx.copy.identity.status, value: localizeCode(ctx.locale, rfq.status) },
          { label: ctx.copy.fields.title, value: rfq.title },
        ],
        paragraphs: rfq.notes ? [rfq.notes] : undefined,
      },
      {
        id: 'lines',
        heading: ctx.copy.sections.quoteLines,
        tables:
          lineRows.length > 0
            ? [
                {
                  headers: [
                    ctx.copy.fields.description,
                    ctx.copy.fields.quantity,
                    ctx.copy.fields.unit,
                  ],
                  rows: lineRows,
                },
              ]
            : undefined,
      },
    ],
    notices: [ctx.copy.snapshotNote],
  });
}

export async function buildCustomerStatementReport(
  context: OrgContext,
  clientId: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const client = await getClientById(context, clientId);
  if (!client) throw new NotFoundError('Client');
  const financials = await getClientFinancials(context, clientId);
  const snap = financials.snapshot;

  return envelope({
    kind: 'customer_statement',
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: {
      companyName: ctx.companyName,
      projectId: null,
      projectName: null,
      projectNumber: null,
      clientName: client.name,
    },
    sections: [
      {
        id: 'ar',
        heading: ctx.copy.sections.identity,
        rows: [
          {
            label: ctx.copy.fields.invoiced,
            value: formatMoney(snap.invoiced, ctx.locale),
            nature: 'cash',
          },
          {
            label: ctx.copy.fields.paid,
            value: formatMoney(snap.paid, ctx.locale),
            nature: 'cash',
          },
          {
            label: ctx.copy.fields.outstanding,
            value: formatMoney(snap.outstanding, ctx.locale),
            nature: 'cash',
          },
          {
            label: ctx.copy.fields.overdue,
            value: formatMoney(snap.overdue, ctx.locale),
            nature: 'cash',
          },
        ],
        paragraphs: [snap.note],
      },
    ],
    notices: [ctx.copy.notices.vatNotProfit, ctx.copy.snapshotNote],
  });
}

export async function buildContractSummaryReport(
  context: OrgContext,
  contractId: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const contract = await findContractById(context.db, context.organizationId, contractId);
  if (!contract) throw new NotFoundError('Contract');
  const chrome = await getProjectDetailChrome(context, contract.projectId);
  const currency = contract.currency;

  return envelope({
    kind: 'contract_summary',
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: {
      companyName: ctx.companyName,
      projectId: chrome.project.id,
      projectName: chrome.project.name,
      projectNumber: chrome.project.documentNumber,
      clientName: chrome.clientName,
      extra: contract.contractNumber ?? contract.name,
    },
    sections: [
      {
        id: 'contract',
        heading: ctx.copy.sections.identity,
        rows: [
          { label: ctx.copy.identity.status, value: localizeCode(ctx.locale, contract.status) },
          {
            label: ctx.copy.fields.currentContract,
            value: contract.originalValueAmount
              ? formatMoney(money(contract.originalValueAmount, currency), ctx.locale)
              : '-',
            nature: 'commercial',
          },
          {
            label: ctx.copy.fields.tax,
            value: contract.originalTaxAmount
              ? formatMoney(money(contract.originalTaxAmount, currency), ctx.locale)
              : '-',
          },
        ],
      },
    ],
    notices: [ctx.copy.notices.vatNotProfit, ctx.copy.snapshotNote],
  });
}

export async function buildWorkOrderReport(
  context: OrgContext,
  workOrderId: string,
  ctx: BuildCtx,
  kind: Extract<ReportKind, 'work_order' | 'service_completion'> = 'work_order',
): Promise<ReportPayload> {
  const detail = await getWorkOrderDetail(context, workOrderId);
  return envelope({
    kind,
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: {
      companyName: ctx.companyName,
      projectId: detail.project.id,
      projectName: detail.project.name,
      projectNumber: detail.project.documentNumber,
      clientName: detail.clientName,
    },
    sections: [
      {
        id: 'work_order',
        heading: ctx.copy.sections.status,
        rows: [
          { label: ctx.copy.identity.status, value: localizeCode(ctx.locale, detail.service.serviceStatus) },
          { label: ctx.copy.identity.location, value: detail.project.location ?? '-' },
          {
            label: ctx.copy.identity.startDate,
            value: detail.project.startDate ?? '-',
          },
        ],
        paragraphs: detail.project.description ? [detail.project.description] : undefined,
      },
    ],
    notices: [ctx.copy.snapshotNote],
  });
}

export async function buildTimesheetReport(
  context: OrgContext,
  timesheetId: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const detail = await getTimesheetDetail(context, timesheetId);
  const entryRows = detail.entries.map((entry) => [
    entry.workDate,
    localizeCode(ctx.locale, entry.kind),
    entry.hours,
    entry.projectName ?? entry.projectId ?? '-',
    entry.description ?? '',
  ]);

  return envelope({
    kind: 'timesheet',
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: {
      companyName: ctx.companyName,
      projectId: null,
      projectName: null,
      projectNumber: null,
      clientName: null,
      extra: detail.timesheet.employeeName ?? detail.timesheet.id,
    },
    sections: [
      {
        id: 'summary',
        heading: ctx.copy.sections.identity,
        rows: [
          { label: ctx.copy.identity.status, value: localizeCode(ctx.locale, detail.timesheet.status) },
          {
            label: ctx.copy.fields.projectHours,
            value: String(detail.totals.projectHours),
          },
          {
            label: ctx.copy.fields.nonProjectHours,
            value: String(detail.totals.nonProjectHours),
          },
        ],
      },
      {
        id: 'entries',
        heading: ctx.copy.sections.quoteLines,
        tables:
          entryRows.length > 0
            ? [
                {
                  headers: [
                    ctx.copy.fields.date,
                    ctx.copy.fields.kind,
                    ctx.copy.fields.hours,
                    ctx.copy.identity.project,
                    ctx.copy.fields.notes,
                  ],
                  rows: entryRows,
                },
              ]
            : undefined,
      },
    ],
    notices: [ctx.copy.snapshotNote],
  });
}

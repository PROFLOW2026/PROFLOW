import type { OrgContext } from '@/shared/auth/context';
import Decimal from 'decimal.js';
import { listAuditEventSummaries } from '@/shared/audit';
import { ORG_LIST_EXPORT_CAP } from '@/shared/db/list-limits';
import { ValidationError } from '@/shared/errors';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listApBillsForOrg } from '@/modules/ap';
import {
  listBillingRecords,
  listPaymentApplications,
  getOrganizationReceivablesAging,
} from '@/modules/billing';
import { listClientsForOrg } from '@/modules/clients';
import { listExpensesForOrg } from '@/modules/expenses';
import { getProjectFinancials } from '@/modules/financials';
import { listPurchaseOrdersWithCommittedForOrg } from '@/modules/procurement';
import { listProjectsForOrg } from '@/modules/projects';
import { listVendorsForOrg } from '@/modules/vendors';
import { listEmployeesForOrg, listTimeEntriesForOrg, canReadWorkforceCost } from '@/modules/workforce';
import {
  getProjectBoqWorkspace,
  listBoqProgress,
  percentComplete,
} from '@/modules/boq';
import { csvDownloadHeaders, rowsToCsv, type CsvCell } from '../domain/csv';
import {
  enumLabel,
  getExportCopy,
  resolveExportLocale,
  toExcelDate,
  toExcelNumber,
  type ExportCopy,
} from '../domain/export-copy';
import type { ExportTable } from '../domain/table';
import { tablesToXlsx, xlsxDownloadHeaders } from '../domain/xlsx';

export const EXPORT_KINDS = [
  'projects',
  'clients',
  'vendors',
  'expenses',
  'billing',
  'project-financials',
  'employees',
  'time-entries',
  'payments',
  'receivables-aging',
  'purchase-orders',
  'ap-bills',
  'audit',
  'boq',
] as const;

export type ExportKind = (typeof EXPORT_KINDS)[number];
export type ExportFormat = 'csv' | 'xlsx';

export interface ExportResult {
  readonly body: string | Uint8Array;
  readonly headers: HeadersInit;
}

function isExportKind(value: string): value is ExportKind {
  return (EXPORT_KINDS as readonly string[]).includes(value);
}

/** Friendly URL aliases → canonical kinds. */
const KIND_ALIASES: Readonly<Record<string, ExportKind>> = {
  time: 'time-entries',
  ar: 'receivables-aging',
  receivables: 'receivables-aging',
  ap: 'ap-bills',
  po: 'purchase-orders',
  'audit-log': 'audit',
  activity: 'audit',
  'bill-of-quantities': 'boq',
  boq_items: 'boq',
};

function resolveExportKind(value: string): ExportKind | null {
  if (isExportKind(value)) return value;
  return KIND_ALIASES[value] ?? null;
}

function isExportFormat(value: string | null | undefined): value is ExportFormat {
  return value === 'csv' || value === 'xlsx';
}

/** Prefer XLSX for multi-column business exports; CSV remains available via ?format=csv. */
const DEFAULT_FORMAT: ExportFormat = 'xlsx';

export async function buildExport(
  context: OrgContext,
  kindRaw: string,
  options: { projectId?: string | null; format?: string | null; locale?: string | null } = {},
): Promise<ExportResult> {
  const kind = resolveExportKind(kindRaw);
  if (!kind) {
    throw new ValidationError([{ path: 'kind', message: 'Unknown export kind' }]);
  }

  const format: ExportFormat = isExportFormat(options.format)
    ? options.format
    : kind === 'audit'
      ? 'csv'
      : DEFAULT_FORMAT;
  const locale = resolveExportLocale(options.locale ?? context.locale);
  const copy = getExportCopy(locale);
  const tables = await buildExportTables(context, kind, copy, options.projectId);
  return serializeExport(tables, kind, context.organizationId, format, locale, options.projectId);
}

/** @deprecated Prefer buildExport - kept for callers that always want CSV. */
export async function buildCsvExport(
  context: OrgContext,
  kindRaw: string,
  options: { projectId?: string | null; locale?: string | null } = {},
): Promise<ExportResult> {
  return buildExport(context, kindRaw, { ...options, format: 'csv' });
}

async function buildExportTables(
  context: OrgContext,
  kind: ExportKind,
  copy: ExportCopy,
  projectId?: string | null,
): Promise<readonly ExportTable[]> {
  switch (kind) {
    case 'projects':
      return [await tableProjects(context, copy)];
    case 'clients':
      return [await tableClients(context, copy)];
    case 'vendors':
      return [await tableVendors(context, copy)];
    case 'expenses':
      return [await tableExpenses(context, copy)];
    case 'billing':
      return [await tableBilling(context, copy)];
    case 'project-financials':
      if (!projectId) {
        throw new ValidationError([{ path: 'projectId', message: 'projectId is required' }]);
      }
      return [await tableProjectFinancials(context, projectId, copy)];
    case 'employees':
      return [await tableEmployees(context, copy)];
    case 'time-entries':
      return [await tableTimeEntries(context, copy)];
    case 'payments':
      return [await tablePayments(context, copy)];
    case 'receivables-aging':
      return await tablesReceivables(context, copy);
    case 'purchase-orders':
      return [await tablePurchaseOrders(context, copy)];
    case 'ap-bills':
      return [await tableApBills(context, copy)];
    case 'audit':
      return [await tableAudit(context, copy)];
    case 'boq':
      if (!projectId) {
        throw new ValidationError([{ path: 'projectId', message: 'projectId is required' }]);
      }
      return [await tableBoq(context, projectId, copy)];
  }
}

function serializeExport(
  tables: readonly ExportTable[],
  kind: ExportKind,
  organizationId: string,
  format: ExportFormat,
  locale: string,
  projectId?: string | null,
): Promise<ExportResult> | ExportResult {
  const stub = organizationId.slice(0, 8);
  const idPart =
    (kind === 'project-financials' || kind === 'boq') && projectId
      ? projectId.slice(0, 8)
      : stub;
  const baseName = `${kind}-${idPart}`;

  if (format === 'csv') {
    const primary = tables[0]!;
    const noteRows: CsvCell[][] = (primary.notes ?? []).map((note) => [note]);
    const body = rowsToCsv(primary.headers, [...primary.rows, ...noteRows]);
    return {
      body,
      headers: csvDownloadHeaders(`${baseName}.csv`),
    };
  }

  return tablesToXlsx(tables, { locale }).then((body) => ({
    body: new Uint8Array(body),
    headers: xlsxDownloadHeaders(`${baseName}.xlsx`),
  }));
}

function h(copy: ExportCopy, key: keyof ExportCopy['headers']): string {
  return copy.headers[key];
}

async function tableProjects(context: OrgContext, copy: ExportCopy): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);
  const canReadContracts = context.permissions.has(PERMISSIONS.CONTRACTS_READ);
  const items = await listProjectsForOrg(context, {
    includeArchived: false,
    limit: ORG_LIST_EXPORT_CAP,
  });

  const headers = [
    h(copy, 'id'),
    h(copy, 'name'),
    h(copy, 'status'),
    h(copy, 'clientName'),
    h(copy, 'currency'),
    h(copy, 'startDate'),
    h(copy, 'targetEndDate'),
    h(copy, 'actualEndDate'),
    ...(canReadContracts ? [h(copy, 'currentContractValue'), h(copy, 'contractCurrency')] : []),
  ];

  const rows = items.map((item) => [
    item.id,
    item.name,
    enumLabel(copy, 'projectStatus', item.status),
    item.clientName,
    item.currency ?? context.organization.baseCurrency,
    toExcelDate(item.startDate),
    toExcelDate(item.targetEndDate),
    toExcelDate(item.actualEndDate),
    ...(canReadContracts
      ? [toExcelNumber(item.currentContractValue), item.contractCurrency]
      : []),
  ]);

  return {
    sheetName: copy.sheets.projects,
    headers,
    rows,
    notes: [copy.notes.projectsContract],
  };
}

async function tableClients(context: OrgContext, copy: ExportCopy): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.CLIENTS_READ);
  const items = await listClientsForOrg(context, { limit: ORG_LIST_EXPORT_CAP });
  return {
    sheetName: copy.sheets.clients,
    headers: [
      h(copy, 'id'),
      h(copy, 'name'),
      h(copy, 'status'),
      h(copy, 'legalName'),
      h(copy, 'email'),
      h(copy, 'phone'),
      h(copy, 'city'),
      h(copy, 'countryCode'),
    ],
    rows: items.map((item) => [
      item.id,
      item.name,
      enumLabel(copy, 'partyStatus', item.status),
      item.legalName,
      item.email,
      item.phone,
      item.city,
      item.countryCode,
    ]),
  };
}

async function tableVendors(context: OrgContext, copy: ExportCopy): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.VENDORS_READ);
  const items = await listVendorsForOrg(context, { limit: ORG_LIST_EXPORT_CAP });
  return {
    sheetName: copy.sheets.vendors,
    headers: [
      h(copy, 'id'),
      h(copy, 'name'),
      h(copy, 'status'),
      h(copy, 'vendorType'),
      h(copy, 'email'),
      h(copy, 'phone'),
      h(copy, 'city'),
      h(copy, 'countryCode'),
    ],
    rows: items.map((item) => [
      item.id,
      item.name,
      enumLabel(copy, 'partyStatus', item.status),
      enumLabel(copy, 'vendorType', item.type),
      item.email,
      item.phone,
      item.city,
      item.countryCode,
    ]),
  };
}

async function tableExpenses(context: OrgContext, copy: ExportCopy): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);
  const { items } = await listExpensesForOrg(context, {
    limit: ORG_LIST_EXPORT_CAP,
    offset: 0,
  });
  return {
    sheetName: copy.sheets.expenses,
    headers: [
      h(copy, 'id'),
      h(copy, 'expenseDate'),
      h(copy, 'description'),
      h(copy, 'supplierName'),
      h(copy, 'projectId'),
      h(copy, 'projectName'),
      h(copy, 'costFamily'),
      h(copy, 'grossAmount'),
      h(copy, 'currency'),
      h(copy, 'status'),
    ],
    rows: items.map((item) => [
      item.id,
      toExcelDate(item.expenseDate),
      item.description,
      item.supplierName,
      item.projectId,
      item.projectName,
      enumLabel(copy, 'costFamily', item.costFamily),
      toExcelNumber(item.grossAmount.amount),
      item.grossAmount.currency,
      enumLabel(copy, 'expenseStatus', item.status),
    ]),
    notes: [copy.notes.expensesCurrency],
  };
}

async function tableBilling(context: OrgContext, copy: ExportCopy): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  const items = await listBillingRecords(context, { limit: ORG_LIST_EXPORT_CAP });
  return {
    sheetName: copy.sheets.billing,
    headers: [
      h(copy, 'id'),
      h(copy, 'projectId'),
      h(copy, 'projectName'),
      h(copy, 'kind'),
      h(copy, 'status'),
      h(copy, 'collectionStatus'),
      h(copy, 'issueDate'),
      h(copy, 'dueDate'),
      h(copy, 'currency'),
      h(copy, 'totalAmount'),
      h(copy, 'paidAmount'),
      h(copy, 'outstandingAmount'),
    ],
    rows: items.map((item) => [
      item.id,
      item.projectId,
      item.projectName,
      enumLabel(copy, 'billingKind', item.kind),
      enumLabel(copy, 'billingStatus', item.status),
      enumLabel(copy, 'collectionStatus', item.collectionStatus),
      toExcelDate(item.issueDate),
      toExcelDate(item.dueDate),
      item.totalAmount.currency,
      toExcelNumber(item.totalAmount.amount),
      toExcelNumber(item.paidAmount.amount),
      toExcelNumber(item.outstandingAmount.amount),
    ]),
    notes: [copy.notes.billingIntegrity],
  };
}

async function tableProjectFinancials(
  context: OrgContext,
  projectId: string,
  copy: ExportCopy,
): Promise<ExportTable> {
  const financials = await getProjectFinancials(context, projectId);
  const headers = [h(copy, 'metric'), h(copy, 'amount'), h(copy, 'currency'), h(copy, 'notes')];
  const rows: CsvCell[][] = [
    [copy.metrics.projectId, projectId, financials.currency, null],
  ];

  if (financials.commercial) {
    const c = financials.commercial;
    rows.push(
      [
        copy.metrics.originalContract,
        toExcelNumber(c.originalContractValue.amount),
        c.originalContractValue.currency,
        copy.metricNotes.netCommercial,
      ],
      [
        copy.metrics.approvedAdditions,
        toExcelNumber(c.approvedAdditions.amount),
        c.approvedAdditions.currency,
        null,
      ],
      [
        copy.metrics.approvedReductions,
        toExcelNumber(c.approvedReductions.amount),
        c.approvedReductions.currency,
        null,
      ],
      [
        copy.metrics.currentContract,
        toExcelNumber(c.currentContractValue.amount),
        c.currentContractValue.currency,
        copy.metricNotes.originalPlusApproved,
      ],
      [
        copy.metrics.pendingChanges,
        toExcelNumber(c.pendingChanges.amount),
        c.pendingChanges.currency,
        copy.metricNotes.notInCurrent,
      ],
    );
  } else {
    rows.push([
      copy.metrics.commercial,
      null,
      financials.currency,
      copy.metricNotes.hidden,
    ]);
  }

  rows.push(
    [
      copy.metrics.invoiced,
      toExcelNumber(financials.billing.invoiced.amount),
      financials.billing.invoiced.currency,
      copy.metricNotes.notRevenue,
    ],
    [
      copy.metrics.paid,
      toExcelNumber(financials.billing.paid.amount),
      financials.billing.paid.currency,
      null,
    ],
    [
      copy.metrics.outstanding,
      toExcelNumber(financials.billing.outstanding.amount),
      financials.billing.outstanding.currency,
      copy.metricNotes.derived,
    ],
    [
      copy.metrics.actualCostToDate,
      toExcelNumber(financials.cost.actualCostToDate.amount),
      financials.cost.actualCostToDate.currency,
      financials.coverage.basis,
    ],
    [
      copy.metrics.estimatedFinalCost,
      toExcelNumber(financials.cost.estimatedFinalCost.amount),
      financials.cost.estimatedFinalCost.currency,
      null,
    ],
  );

  if (context.permissions.has(PERMISSIONS.PROJECT_PROFIT_READ) && financials.profit) {
    rows.push(
      [
        copy.metrics.estimatedProfit,
        toExcelNumber(financials.profit.estimatedProfit.amount),
        financials.profit.estimatedProfit.currency,
        copy.metricNotes.estimateOnly,
      ],
      [copy.metrics.marginPercent, toExcelNumber(financials.profit.marginPercent), null, null],
    );
  }

  rows.push([
    copy.metrics.coveragePartials,
    financials.coverage.partials?.map((p) => p.reason).join('|') || null,
    null,
    financials.coverage.basis,
  ]);

  return {
    sheetName: copy.sheets.projectFinancials,
    headers,
    rows,
    notes: [copy.notes.projectFinancialsProfit],
  };
}

async function tableEmployees(context: OrgContext, copy: ExportCopy): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.WORKFORCE_READ);
  const items = await listEmployeesForOrg(context, {});
  const includeRates = canReadWorkforceCost(context);
  return {
    sheetName: copy.sheets.employees,
    headers: [
      h(copy, 'id'),
      h(copy, 'name'),
      h(copy, 'status'),
      h(copy, 'employeeNumber'),
      h(copy, 'jobTitle'),
      h(copy, 'email'),
      h(copy, 'phone'),
      ...(includeRates
        ? [h(copy, 'currentRate'), h(copy, 'rateUnit'), h(copy, 'rateCurrency')]
        : []),
    ],
    rows: items.map((item) => [
      item.id,
      item.name,
      enumLabel(copy, 'employeeStatus', item.status),
      item.employeeNumber,
      item.jobTitle,
      item.email,
      item.phone,
      ...(includeRates
        ? [
            toExcelNumber(item.currentRate),
            enumLabel(copy, 'rateUnit', item.currentRateUnit),
            item.currentRateCurrency,
          ]
        : []),
    ]),
  };
}

async function tableTimeEntries(context: OrgContext, copy: ExportCopy): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.WORKFORCE_READ);
  const items = await listTimeEntriesForOrg(context, {
    kind: 'all',
    limit: ORG_LIST_EXPORT_CAP,
  });
  const includeCosts =
    canReadWorkforceCost(context) || hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  return {
    sheetName: copy.sheets.timeEntries,
    headers: [
      h(copy, 'id'),
      h(copy, 'workDate'),
      h(copy, 'employeeId'),
      h(copy, 'employeeName'),
      h(copy, 'kind'),
      h(copy, 'hours'),
      h(copy, 'projectId'),
      h(copy, 'projectName'),
      h(copy, 'workPackageName'),
      h(copy, 'timeCodeName'),
      ...(includeCosts ? [h(copy, 'costAmount'), h(copy, 'costCurrency')] : []),
      h(copy, 'description'),
    ],
    rows: items.map((item) => [
      item.id,
      toExcelDate(item.workDate),
      item.employeeId,
      item.employeeName,
      enumLabel(copy, 'timeEntryKind', item.kind),
      toExcelNumber(item.hours),
      item.projectId,
      item.projectName,
      item.workPackageName,
      item.timeCodeName,
      ...(includeCosts ? [toExcelNumber(item.costAmount), item.costCurrency] : []),
      item.description,
    ]),
    notes: [copy.notes.timeEntriesCurrency, copy.notes.timeEntriesCap],
  };
}

async function tablePayments(context: OrgContext, copy: ExportCopy): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  const items = await listAllPaymentApplications(context);
  return {
    sheetName: copy.sheets.payments,
    headers: [
      h(copy, 'id'),
      h(copy, 'billingRecordId'),
      h(copy, 'billingReference'),
      h(copy, 'billingKind'),
      h(copy, 'projectId'),
      h(copy, 'projectName'),
      h(copy, 'amount'),
      h(copy, 'currency'),
      h(copy, 'paymentDate'),
      h(copy, 'method'),
      h(copy, 'reference'),
      h(copy, 'status'),
      h(copy, 'notes'),
    ],
    rows: items.map((item) => [
      item.id,
      item.billingRecordId,
      item.billingReference,
      enumLabel(copy, 'billingKind', item.billingKind),
      item.projectId,
      item.projectName,
      toExcelNumber(item.amount.amount),
      item.amount.currency,
      toExcelDate(item.paymentDate),
      item.method,
      item.reference,
      enumLabel(copy, 'paymentStatus', item.status),
      item.notes,
    ]),
    notes: [copy.notes.paymentsIntegrity],
  };
}

async function listAllPaymentApplications(context: OrgContext) {
  const pageSize = 200;
  const all: Awaited<ReturnType<typeof listPaymentApplications>> = [];
  for (let offset = 0; offset < 5_000; offset += pageSize) {
    const batch = await listPaymentApplications(context, { limit: pageSize, offset });
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

async function tablesReceivables(
  context: OrgContext,
  copy: ExportCopy,
): Promise<readonly ExportTable[]> {
  const [outstanding, aging] = await Promise.all([
    tableReceivablesOutstanding(context, copy),
    tableReceivablesAging(context, copy),
  ]);
  return [outstanding, aging];
}

async function tableReceivablesOutstanding(
  context: OrgContext,
  copy: ExportCopy,
): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  const items = await listBillingRecords(context, {
    filter: 'outstanding',
    limit: ORG_LIST_EXPORT_CAP,
  });
  return {
    sheetName: copy.sheets.arOutstanding,
    headers: [
      h(copy, 'id'),
      h(copy, 'projectId'),
      h(copy, 'projectName'),
      h(copy, 'kind'),
      h(copy, 'status'),
      h(copy, 'collectionStatus'),
      h(copy, 'issueDate'),
      h(copy, 'dueDate'),
      h(copy, 'currency'),
      h(copy, 'totalAmount'),
      h(copy, 'paidAmount'),
      h(copy, 'outstandingAmount'),
    ],
    rows: items.map((item) => [
      item.id,
      item.projectId,
      item.projectName,
      enumLabel(copy, 'billingKind', item.kind),
      enumLabel(copy, 'billingStatus', item.status),
      enumLabel(copy, 'collectionStatus', item.collectionStatus),
      toExcelDate(item.issueDate),
      toExcelDate(item.dueDate),
      item.totalAmount.currency,
      toExcelNumber(item.totalAmount.amount),
      toExcelNumber(item.paidAmount.amount),
      toExcelNumber(item.outstandingAmount.amount),
    ]),
    notes: [copy.notes.arCurrency, copy.notes.arIntegrity],
  };
}

async function tableReceivablesAging(context: OrgContext, copy: ExportCopy): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  const aging = await getOrganizationReceivablesAging(context);
  return {
    sheetName: copy.sheets.arAging,
    headers: [
      h(copy, 'bucket'),
      h(copy, 'count'),
      h(copy, 'totalOutstanding'),
      h(copy, 'currency'),
      h(copy, 'asOf'),
    ],
    rows: aging.buckets.map((bucket) => [
      enumLabel(copy, 'agingBucket', bucket.key),
      bucket.count,
      toExcelNumber(bucket.total.amount),
      aging.currency,
      toExcelDate(aging.asOf),
    ]),
    notes: [
      // Localized disclosure - do not pass domain English `aging.note` into he-IL workbooks.
      copy.notes.arAgingRules,
      copy.notes.arAgingBase.replace('{currency}', aging.currency),
      copy.notes.arAgingOutstanding,
    ],
  };
}

async function tablePurchaseOrders(context: OrgContext, copy: ExportCopy): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.PROCUREMENT_READ);
  const items = await listPurchaseOrdersWithCommittedForOrg(context, undefined, {
    limit: ORG_LIST_EXPORT_CAP,
  });
  return {
    sheetName: copy.sheets.purchaseOrders,
    headers: [
      h(copy, 'id'),
      h(copy, 'reference'),
      h(copy, 'status'),
      h(copy, 'vendorId'),
      h(copy, 'projectId'),
      h(copy, 'currency'),
      h(copy, 'committedAmount'),
      h(copy, 'committedCostStatus'),
      h(copy, 'committedCostAmount'),
      h(copy, 'orderedOn'),
      h(copy, 'revision'),
      h(copy, 'notes'),
    ],
    rows: items.map((item) => [
      item.id,
      item.reference,
      enumLabel(copy, 'purchaseOrderStatus', item.status),
      item.vendorId,
      item.projectId,
      item.currency,
      toExcelNumber(item.committedAmount),
      item.committedCost?.status
        ? enumLabel(copy, 'committedCostStatus', item.committedCost.status)
        : null,
      toExcelNumber(item.committedCost?.amount ?? null),
      toExcelDate(item.orderedOn),
      item.revision,
      item.notes,
    ]),
    notes: [copy.notes.poCommitted],
  };
}

async function tableApBills(context: OrgContext, copy: ExportCopy): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.AP_READ);
  const items = await listApBillsForOrg(context, { limit: ORG_LIST_EXPORT_CAP });
  return {
    sheetName: copy.sheets.apBills,
    headers: [
      h(copy, 'id'),
      h(copy, 'reference'),
      h(copy, 'status'),
      h(copy, 'vendorId'),
      h(copy, 'vendorName'),
      h(copy, 'projectId'),
      h(copy, 'purchaseOrderId'),
      h(copy, 'billDate'),
      h(copy, 'dueDate'),
      h(copy, 'currency'),
      h(copy, 'totalAmount'),
      h(copy, 'notes'),
    ],
    rows: items.map((item) => [
      item.id,
      item.reference,
      enumLabel(copy, 'apBillStatus', item.status),
      item.vendorId,
      item.vendorName,
      item.projectId,
      item.purchaseOrderId,
      toExcelDate(item.billDate),
      toExcelDate(item.dueDate),
      item.currency,
      toExcelNumber(item.totalAmount),
      item.notes,
    ]),
    notes: [copy.notes.apNeExpense],
  };
}

/** Same columns as the activity UI; never includes before/after payloads. */
async function tableAudit(context: OrgContext, copy: ExportCopy): Promise<ExportTable> {
  const { items } = await listAuditEventSummaries(context, { limit: ORG_LIST_EXPORT_CAP });
  return {
    sheetName: copy.sheets.activityLog,
    headers: [
      h(copy, 'id'),
      h(copy, 'createdAt'),
      h(copy, 'actorUserId'),
      h(copy, 'actorDisplayName'),
      h(copy, 'actorEmail'),
      h(copy, 'action'),
      h(copy, 'entityType'),
      h(copy, 'entityId'),
    ],
    rows: items.map((item) => [
      item.id,
      item.createdAt.toISOString(),
      item.actorUserId,
      item.actorDisplayName,
      item.actorEmail,
      item.action,
      item.entityType,
      item.entityId,
    ]),
    notes: [
      copy.notes.auditPermission,
      copy.notes.auditPayloads,
      copy.notes.auditCap.replace('{cap}', String(ORG_LIST_EXPORT_CAP)),
    ],
  };
}

/**
 * Project BOQ export: chapters/items with qty/prices/totals and optional progress.
 * Requires projectId. Progress columns fill when approved progress exists.
 */
async function tableBoq(
  context: OrgContext,
  projectId: string,
  copy: ExportCopy,
): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.BOQ_READ);
  const workspace = await getProjectBoqWorkspace(context, projectId);
  const canSeePrices = context.permissions.has(PERMISSIONS.BOQ_MANAGE);

  const approvedByNode = new Map<string, string>();
  if (workspace.activeBoq) {
    try {
      const progress = await listBoqProgress(context, workspace.activeBoq.id);
      for (const { batch, lines } of progress.batches) {
        if (batch.status !== 'approved' && batch.status !== 'billed') continue;
        for (const line of lines) {
          const prev = approvedByNode.get(line.boqNodeId) ?? '0';
          const next = new Decimal(prev).plus(line.approvedQuantity || '0').toFixed();
          approvedByNode.set(line.boqNodeId, next);
        }
      }
    } catch {
      // Optional progress - workspace still exports baseline.
    }
  }

  const nodes = workspace.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  function chapterPath(node: (typeof nodes)[number]): { chapter: string; subchapter: string } {
    if (!node.parentId) {
      return node.nodeKind === 'chapter'
        ? { chapter: node.description, subchapter: '' }
        : { chapter: '', subchapter: '' };
    }
    const parent = byId.get(node.parentId);
    if (!parent) return { chapter: '', subchapter: '' };
    if (!parent.parentId) {
      return { chapter: parent.description, subchapter: '' };
    }
    const grand = byId.get(parent.parentId);
    return {
      chapter: grand?.description ?? parent.description,
      subchapter: parent.description,
    };
  }

  const headers = [
    h(copy, 'itemCode'),
    h(copy, 'nodeKind'),
    h(copy, 'chapter'),
    h(copy, 'subchapter'),
    h(copy, 'description'),
    h(copy, 'unit'),
    h(copy, 'quantity'),
    ...(canSeePrices
      ? [h(copy, 'unitPrice'), h(copy, 'originalAmount'), h(copy, 'currentAmount')]
      : []),
    h(copy, 'currentQuantity'),
    h(copy, 'approvedQuantity'),
    h(copy, 'percentComplete'),
    h(copy, 'status'),
    h(copy, 'currency'),
  ];

  const currency = workspace.totals.currency;
  const rows: CsvCell[][] = nodes.map((node) => {
    const path = chapterPath(node);
    const opening = node.openingApprovedQuantity ?? '0';
    const fromBatches = approvedByNode.get(node.id) ?? '0';
    const cumulativeApproved =
      node.nodeKind === 'item'
        ? new Decimal(opening || '0').plus(fromBatches || '0').toFixed()
        : '';
    const pct =
      node.nodeKind === 'item'
        ? percentComplete({
            cumulativeApproved,
            currentQuantity: node.currentQuantity,
          })
        : '';

    return [
      node.itemCode,
      node.nodeKind,
      path.chapter,
      node.nodeKind === 'chapter' && node.parentId ? node.description : path.subchapter,
      node.description,
      node.unit,
      toExcelNumber(node.originalQuantity),
      ...(canSeePrices
        ? [
            toExcelNumber(node.originalUnitPrice),
            toExcelNumber(node.originalAmount),
            toExcelNumber(node.currentAmount),
          ]
        : []),
      toExcelNumber(node.currentQuantity),
      cumulativeApproved ? toExcelNumber(cumulativeApproved) : null,
      pct ? toExcelNumber(pct) : null,
      node.status,
      currency,
    ];
  });

  // Totals footer row
  rows.push([
    null,
    'total',
    null,
    null,
    'TOTAL',
    null,
    null,
    ...(canSeePrices
      ? [null, toExcelNumber(workspace.totals.originalAmount), toExcelNumber(workspace.totals.currentAmount)]
      : []),
    null,
    null,
    null,
    null,
    currency,
  ]);

  return {
    sheetName: copy.sheets.boq,
    headers,
    rows,
    notes: [copy.notes.boqProgressOptional],
  };
}

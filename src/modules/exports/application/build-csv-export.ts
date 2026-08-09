import type { OrgContext } from '@/shared/auth/context';
import { listAuditEventSummaries } from '@/shared/audit';
import { ORG_LIST_EXPORT_CAP } from '@/shared/db/list-limits';
import { ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
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
import { listEmployeesForOrg, listTimeEntriesForOrg } from '@/modules/workforce';
import { csvDownloadHeaders, rowsToCsv, type CsvCell } from '../domain/csv';
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
  options: { projectId?: string | null; format?: string | null } = {},
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
  const tables = await buildExportTables(context, kind, options.projectId);
  return serializeExport(tables, kind, context.organizationId, format, options.projectId);
}

/** @deprecated Prefer buildExport — kept for callers that always want CSV. */
export async function buildCsvExport(
  context: OrgContext,
  kindRaw: string,
  options: { projectId?: string | null } = {},
): Promise<ExportResult> {
  return buildExport(context, kindRaw, { ...options, format: 'csv' });
}

async function buildExportTables(
  context: OrgContext,
  kind: ExportKind,
  projectId?: string | null,
): Promise<readonly ExportTable[]> {
  switch (kind) {
    case 'projects':
      return [await tableProjects(context)];
    case 'clients':
      return [await tableClients(context)];
    case 'vendors':
      return [await tableVendors(context)];
    case 'expenses':
      return [await tableExpenses(context)];
    case 'billing':
      return [await tableBilling(context)];
    case 'project-financials':
      if (!projectId) {
        throw new ValidationError([{ path: 'projectId', message: 'projectId is required' }]);
      }
      return [await tableProjectFinancials(context, projectId)];
    case 'employees':
      return [await tableEmployees(context)];
    case 'time-entries':
      return [await tableTimeEntries(context)];
    case 'payments':
      return [await tablePayments(context)];
    case 'receivables-aging':
      return await tablesReceivables(context);
    case 'purchase-orders':
      return [await tablePurchaseOrders(context)];
    case 'ap-bills':
      return [await tableApBills(context)];
    case 'audit':
      return [await tableAudit(context)];
  }
}

function serializeExport(
  tables: readonly ExportTable[],
  kind: ExportKind,
  organizationId: string,
  format: ExportFormat,
  projectId?: string | null,
): Promise<ExportResult> | ExportResult {
  const stub = organizationId.slice(0, 8);
  const idPart = kind === 'project-financials' && projectId ? projectId.slice(0, 8) : stub;
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

  return tablesToXlsx(tables).then((body) => ({
    body: new Uint8Array(body),
    headers: xlsxDownloadHeaders(`${baseName}.xlsx`),
  }));
}

async function tableProjects(context: OrgContext): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);
  const canReadContracts = context.permissions.has(PERMISSIONS.CONTRACTS_READ);
  const items = await listProjectsForOrg(context, {
    includeArchived: false,
    limit: ORG_LIST_EXPORT_CAP,
  });

  const headers = [
    'id',
    'name',
    'status',
    'client_name',
    'currency',
    'start_date',
    'target_end_date',
    'actual_end_date',
    ...(canReadContracts ? (['current_contract_value', 'contract_currency'] as const) : []),
  ];

  const rows = items.map((item) => [
    item.id,
    item.name,
    item.status,
    item.clientName,
    item.currency ?? context.organization.baseCurrency,
    item.startDate,
    item.targetEndDate,
    item.actualEndDate,
    ...(canReadContracts ? [item.currentContractValue, item.contractCurrency] : []),
  ]);

  return {
    sheetName: 'Projects',
    headers,
    rows,
    notes: ['Contract amounts appear only with contracts:read. Currencies are per-row; do not sum mixed currencies.'],
  };
}

async function tableClients(context: OrgContext): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.CLIENTS_READ);
  const items = await listClientsForOrg(context, { limit: ORG_LIST_EXPORT_CAP });
  return {
    sheetName: 'Clients',
    headers: ['id', 'name', 'status', 'legal_name', 'email', 'phone', 'city', 'country_code'],
    rows: items.map((item) => [
      item.id,
      item.name,
      item.status,
      item.legalName,
      item.email,
      item.phone,
      item.city,
      item.countryCode,
    ]),
  };
}

async function tableVendors(context: OrgContext): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.VENDORS_READ);
  const items = await listVendorsForOrg(context, { limit: ORG_LIST_EXPORT_CAP });
  return {
    sheetName: 'Vendors',
    headers: ['id', 'name', 'status', 'vendor_type', 'email', 'phone', 'city', 'country_code'],
    rows: items.map((item) => [
      item.id,
      item.name,
      item.status,
      item.type,
      item.email,
      item.phone,
      item.city,
      item.countryCode,
    ]),
  };
}

async function tableExpenses(context: OrgContext): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);
  const { items } = await listExpensesForOrg(context, {
    limit: ORG_LIST_EXPORT_CAP,
    offset: 0,
  });
  return {
    sheetName: 'Expenses',
    headers: [
      'id',
      'expense_date',
      'description',
      'supplier_name',
      'project_id',
      'project_name',
      'cost_family',
      'gross_amount',
      'currency',
      'status',
    ],
    rows: items.map((item) => [
      item.id,
      item.expenseDate,
      item.description,
      item.supplierName,
      item.projectId,
      item.projectName,
      item.costFamily,
      item.grossAmount.amount,
      item.grossAmount.currency,
      item.status,
    ]),
    notes: ['Amounts are per-row currency. Do not aggregate across currencies. Draft ≠ finalized.'],
  };
}

async function tableBilling(context: OrgContext): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  const items = await listBillingRecords(context, { limit: ORG_LIST_EXPORT_CAP });
  return {
    sheetName: 'Billing',
    headers: [
      'id',
      'project_id',
      'project_name',
      'kind',
      'status',
      'collection_status',
      'issue_date',
      'due_date',
      'currency',
      'total_amount',
      'paid_amount',
      'outstanding_amount',
    ],
    rows: items.map((item) => [
      item.id,
      item.projectId,
      item.projectName,
      item.kind,
      item.status,
      item.collectionStatus,
      item.issueDate,
      item.dueDate,
      item.totalAmount.currency,
      item.totalAmount.amount,
      item.paidAmount.amount,
      item.outstandingAmount.amount,
    ]),
    notes: [
      'Contract ≠ Billing ≠ Payment. Outstanding is derived. Do not label totals as Revenue. No cross-currency sum.',
    ],
  };
}

async function tableProjectFinancials(context: OrgContext, projectId: string): Promise<ExportTable> {
  const financials = await getProjectFinancials(context, projectId);
  const headers = ['metric', 'amount', 'currency', 'notes'];
  const rows: CsvCell[][] = [['project_id', projectId, financials.currency, null]];

  if (financials.commercial) {
    const c = financials.commercial;
    rows.push(
      ['original_contract', c.originalContractValue.amount, c.originalContractValue.currency, 'net commercial'],
      ['approved_additions', c.approvedAdditions.amount, c.approvedAdditions.currency, null],
      ['approved_reductions', c.approvedReductions.amount, c.approvedReductions.currency, null],
      ['current_contract', c.currentContractValue.amount, c.currentContractValue.currency, 'original ± approved'],
      ['pending_changes', c.pendingChanges.amount, c.pendingChanges.currency, 'not included in current'],
    );
  } else {
    rows.push(['commercial', null, financials.currency, 'hidden_by_permission_or_unavailable']);
  }

  rows.push(
    ['invoiced', financials.billing.invoiced.amount, financials.billing.invoiced.currency, 'not revenue label'],
    ['paid', financials.billing.paid.amount, financials.billing.paid.currency, null],
    ['outstanding', financials.billing.outstanding.amount, financials.billing.outstanding.currency, 'derived'],
    [
      'actual_cost_to_date',
      financials.cost.actualCostToDate.amount,
      financials.cost.actualCostToDate.currency,
      financials.coverage.basis,
    ],
    [
      'estimated_final_cost',
      financials.cost.estimatedFinalCost.amount,
      financials.cost.estimatedFinalCost.currency,
      null,
    ],
  );

  if (context.permissions.has(PERMISSIONS.PROJECT_PROFIT_READ) && financials.profit) {
    rows.push(
      [
        'estimated_profit',
        financials.profit.estimatedProfit.amount,
        financials.profit.estimatedProfit.currency,
        'estimate only; VAT is not profit',
      ],
      ['margin_percent', financials.profit.marginPercent, null, null],
    );
  }

  rows.push([
    'coverage_partials',
    financials.coverage.partials?.map((p) => p.reason).join('|') || null,
    null,
    financials.coverage.basis,
  ]);

  return {
    sheetName: 'Project financials',
    headers,
    rows,
    notes: ['Profit metrics require project_profit:read. Single project currency only.'],
  };
}

async function tableEmployees(context: OrgContext): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.WORKFORCE_READ);
  const items = await listEmployeesForOrg(context, {});
  return {
    sheetName: 'Employees',
    headers: [
      'id',
      'name',
      'status',
      'employee_number',
      'job_title',
      'email',
      'phone',
      'current_rate',
      'rate_unit',
      'rate_currency',
    ],
    rows: items.map((item) => [
      item.id,
      item.name,
      item.status,
      item.employeeNumber,
      item.jobTitle,
      item.email,
      item.phone,
      item.currentRate,
      item.currentRateUnit,
      item.currentRateCurrency,
    ]),
  };
}

async function tableTimeEntries(context: OrgContext): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.WORKFORCE_READ);
  const items = await listTimeEntriesForOrg(context, {
    kind: 'all',
    limit: ORG_LIST_EXPORT_CAP,
  });
  return {
    sheetName: 'Time entries',
    headers: [
      'id',
      'work_date',
      'employee_id',
      'employee_name',
      'kind',
      'hours',
      'project_id',
      'project_name',
      'work_package_name',
      'time_code_name',
      'cost_amount',
      'cost_currency',
      'description',
    ],
    rows: items.map((item) => [
      item.id,
      item.workDate,
      item.employeeId,
      item.employeeName,
      item.kind,
      item.hours,
      item.projectId,
      item.projectName,
      item.workPackageName,
      item.timeCodeName,
      item.costAmount,
      item.costCurrency,
      item.description,
    ]),
    notes: [
      'Labor cost snapshots are per entry currency. Do not mix currencies when totaling.',
      'Export capped at 5000 rows.',
    ],
  };
}

async function tablePayments(context: OrgContext): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  const items = await listAllPaymentApplications(context);
  return {
    sheetName: 'Payments',
    headers: [
      'id',
      'billing_record_id',
      'billing_reference',
      'billing_kind',
      'project_id',
      'project_name',
      'amount',
      'currency',
      'payment_date',
      'method',
      'reference',
      'status',
      'notes',
    ],
    rows: items.map((item) => [
      item.id,
      item.billingRecordId,
      item.billingReference,
      item.billingKind,
      item.projectId,
      item.projectName,
      item.amount.amount,
      item.amount.currency,
      item.paymentDate,
      item.method,
      item.reference,
      item.status,
      item.notes,
    ]),
    notes: ['Payment ≠ Billing total. Voided payments excluded unless explicitly requested later.'],
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

async function tablesReceivables(context: OrgContext): Promise<readonly ExportTable[]> {
  const [outstanding, aging] = await Promise.all([
    tableReceivablesOutstanding(context),
    tableReceivablesAging(context),
  ]);
  return [outstanding, aging];
}

async function tableReceivablesOutstanding(context: OrgContext): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  const items = await listBillingRecords(context, { filter: 'outstanding', limit: ORG_LIST_EXPORT_CAP });
  return {
    sheetName: 'AR outstanding',
    headers: [
      'id',
      'project_id',
      'project_name',
      'kind',
      'status',
      'collection_status',
      'issue_date',
      'due_date',
      'currency',
      'total_amount',
      'paid_amount',
      'outstanding_amount',
    ],
    rows: items.map((item) => [
      item.id,
      item.projectId,
      item.projectName,
      item.kind,
      item.status,
      item.collectionStatus,
      item.issueDate,
      item.dueDate,
      item.totalAmount.currency,
      item.totalAmount.amount,
      item.paidAmount.amount,
      item.outstandingAmount.amount,
    ]),
    notes: [
      'Per-row currency — do not sum mixed currencies.',
      'Outstanding is derived. Contract ≠ Billing ≠ Payment. Not labelled as Revenue.',
    ],
  };
}

async function tableReceivablesAging(context: OrgContext): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  const aging = await getOrganizationReceivablesAging(context);
  return {
    sheetName: 'AR aging',
    headers: ['bucket', 'count', 'total_outstanding', 'currency', 'as_of'],
    rows: aging.buckets.map((bucket) => [
      bucket.key,
      bucket.count,
      bucket.total.amount,
      aging.currency,
      aging.asOf,
    ]),
    notes: [
      aging.note,
      `Organization base currency only (${aging.currency}). Foreign-currency outstanding excluded from bucket totals.`,
      'Aging uses Outstanding, not Invoiced. VAT is not profit.',
    ],
  };
}

async function tablePurchaseOrders(context: OrgContext): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.PROCUREMENT_READ);
  const items = await listPurchaseOrdersWithCommittedForOrg(context, undefined, {
    limit: ORG_LIST_EXPORT_CAP,
  });
  return {
    sheetName: 'Purchase orders',
    headers: [
      'id',
      'reference',
      'status',
      'vendor_id',
      'project_id',
      'currency',
      'committed_amount',
      'committed_cost_status',
      'committed_cost_amount',
      'ordered_on',
      'revision',
      'notes',
    ],
    rows: items.map((item) => [
      item.id,
      item.reference,
      item.status,
      item.vendorId,
      item.projectId,
      item.currency,
      item.committedAmount,
      item.committedCost?.status ?? null,
      item.committedCost?.amount ?? null,
      item.orderedOn,
      item.revision,
      item.notes,
    ]),
    notes: [
      'CommittedCost ≠ Expense. Issued PO commitment is not actual cost until received/expensed per domain rules.',
    ],
  };
}

async function tableApBills(context: OrgContext): Promise<ExportTable> {
  assertPermission(context, PERMISSIONS.AP_READ);
  const items = await listApBillsForOrg(context, { limit: ORG_LIST_EXPORT_CAP });
  return {
    sheetName: 'AP bills',
    headers: [
      'id',
      'reference',
      'status',
      'vendor_id',
      'vendor_name',
      'project_id',
      'purchase_order_id',
      'bill_date',
      'due_date',
      'currency',
      'total_amount',
      'notes',
    ],
    rows: items.map((item) => [
      item.id,
      item.reference,
      item.status,
      item.vendorId,
      item.vendorName,
      item.projectId,
      item.purchaseOrderId,
      item.billDate,
      item.dueDate,
      item.currency,
      item.totalAmount,
      item.notes,
    ]),
    notes: ['AP Bill ≠ Expense. Match status lives on the bill lifecycle, not as a payment.'],
  };
}

/** Same columns as the activity UI; never includes before/after payloads. */
async function tableAudit(context: OrgContext): Promise<ExportTable> {
  const { items } = await listAuditEventSummaries(context, { limit: ORG_LIST_EXPORT_CAP });
  return {
    sheetName: 'Activity log',
    headers: [
      'id',
      'created_at',
      'actor_user_id',
      'actor_display_name',
      'actor_email',
      'action',
      'entity_type',
      'entity_id',
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
      'Requires audit.read (same permission as Settings → Activity).',
      'Before/after payloads are omitted intentionally — same safety contract as the activity UI.',
      `Export capped at ${ORG_LIST_EXPORT_CAP} newest events.`,
    ],
  };
}

import type { OrgContext } from '@/shared/auth/context';
import { ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listBillingRecords } from '@/modules/billing';
import { listClientsForOrg } from '@/modules/clients';
import { listExpensesForOrg } from '@/modules/expenses';
import { getProjectFinancials } from '@/modules/financials';
import { listProjectsForOrg } from '@/modules/projects';
import { listVendorsForOrg } from '@/modules/vendors';
import { csvDownloadHeaders, rowsToCsv } from '../domain/csv';

export const EXPORT_KINDS = [
  'projects',
  'clients',
  'vendors',
  'expenses',
  'billing',
  'project-financials',
] as const;

export type ExportKind = (typeof EXPORT_KINDS)[number];

export interface ExportResult {
  readonly body: string;
  readonly headers: HeadersInit;
}

function isExportKind(value: string): value is ExportKind {
  return (EXPORT_KINDS as readonly string[]).includes(value);
}

export async function buildCsvExport(
  context: OrgContext,
  kindRaw: string,
  options: { projectId?: string | null } = {},
): Promise<ExportResult> {
  if (!isExportKind(kindRaw)) {
    throw new ValidationError([{ path: 'kind', message: 'Unknown export kind' }]);
  }

  switch (kindRaw) {
    case 'projects':
      return exportProjects(context);
    case 'clients':
      return exportClients(context);
    case 'vendors':
      return exportVendors(context);
    case 'expenses':
      return exportExpenses(context);
    case 'billing':
      return exportBilling(context);
    case 'project-financials':
      if (!options.projectId) {
        throw new ValidationError([{ path: 'projectId', message: 'projectId is required' }]);
      }
      return exportProjectFinancials(context, options.projectId);
  }
}

async function exportProjects(context: OrgContext): Promise<ExportResult> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);
  const canReadContracts = context.permissions.has(PERMISSIONS.CONTRACTS_READ);
  const items = await listProjectsForOrg(context, { includeArchived: false });

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
    body: rowsToCsv(headers, rows),
    headers: csvDownloadHeaders(`projects-${context.organizationId.slice(0, 8)}.csv`),
  };
}

async function exportClients(context: OrgContext): Promise<ExportResult> {
  const items = await listClientsForOrg(context, {});
  const headers = [
    'id',
    'name',
    'status',
    'legal_name',
    'email',
    'phone',
    'city',
    'country_code',
  ];
  const rows = items.map((item) => [
    item.id,
    item.name,
    item.status,
    item.legalName,
    item.email,
    item.phone,
    item.city,
    item.countryCode,
  ]);
  return {
    body: rowsToCsv(headers, rows),
    headers: csvDownloadHeaders(`clients-${context.organizationId.slice(0, 8)}.csv`),
  };
}

async function exportVendors(context: OrgContext): Promise<ExportResult> {
  const items = await listVendorsForOrg(context, {});
  const headers = ['id', 'name', 'status', 'vendor_type', 'email', 'phone', 'city', 'country_code'];
  const rows = items.map((item) => [
    item.id,
    item.name,
    item.status,
    item.type,
    item.email,
    item.phone,
    item.city,
    item.countryCode,
  ]);
  return {
    body: rowsToCsv(headers, rows),
    headers: csvDownloadHeaders(`vendors-${context.organizationId.slice(0, 8)}.csv`),
  };
}

async function exportExpenses(context: OrgContext): Promise<ExportResult> {
  // Cap for pre-launch CSV; full account export is a later wave.
  const { items } = await listExpensesForOrg(context, { limit: 5_000, offset: 0 });
  const headers = [
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
  ];
  const rows = items.map((item) => [
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
  ]);
  return {
    body: rowsToCsv(headers, rows),
    headers: csvDownloadHeaders(`expenses-${context.organizationId.slice(0, 8)}.csv`),
  };
}

async function exportBilling(context: OrgContext): Promise<ExportResult> {
  const items = await listBillingRecords(context, { limit: 5_000 });
  const headers = [
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
  ];
  const rows = items.map((item) => [
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
  ]);
  return {
    body: rowsToCsv(headers, rows),
    headers: csvDownloadHeaders(`billing-${context.organizationId.slice(0, 8)}.csv`),
  };
}

async function exportProjectFinancials(context: OrgContext, projectId: string): Promise<ExportResult> {
  const financials = await getProjectFinancials(context, projectId);
  const headers = ['metric', 'amount', 'currency', 'notes'];
  const rows: (string | null)[][] = [
    ['project_id', projectId, financials.currency, null],
  ];

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

  if (context.permissions.has(PERMISSIONS.PROJECT_PROFIT_READ)) {
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
    body: rowsToCsv(headers, rows),
    headers: csvDownloadHeaders(`project-financials-${projectId.slice(0, 8)}.csv`),
  };
}

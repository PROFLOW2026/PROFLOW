import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { ValidationError } from '@/shared/errors';
import { REPORT_KINDS, type ReportKind, type ReportKindDefinition } from './types';

export const REPORT_KIND_DEFINITIONS: readonly ReportKindDefinition[] = [
  { kind: 'project_status', permission: PERMISSIONS.PROJECTS_READ, projectScoped: true },
  {
    kind: 'project_financial_summary',
    permission: PERMISSIONS.PROJECT_FINANCIALS_READ,
    projectScoped: true,
  },
  { kind: 'boq_progress', permission: PERMISSIONS.BOQ_READ, projectScoped: true },
  { kind: 'change_order_summary', permission: PERMISSIONS.CHANGES_READ, projectScoped: true },
  { kind: 'quote_estimate', permission: PERMISSIONS.QUOTES_READ, projectScoped: false },
  { kind: 'field_daily', permission: PERMISSIONS.FIELD_OPS_READ, projectScoped: false },
  { kind: 'punch_inspection', permission: PERMISSIONS.FIELD_OPS_READ, projectScoped: false },
  {
    kind: 'vendor_subcontract_summary',
    permission: PERMISSIONS.VENDORS_READ,
    projectScoped: true,
  },
  { kind: 'client_360', permission: PERMISSIONS.CLIENTS_READ, projectScoped: false },
  { kind: 'vendor_360', permission: PERMISSIONS.VENDORS_READ, projectScoped: false },
  { kind: 'contract_portfolio', permission: PERMISSIONS.CONTRACTS_READ, projectScoped: false },
  { kind: 'subcontract_cash', permission: PERMISSIONS.VENDORS_READ, projectScoped: false },
  { kind: 'labor_utilization', permission: PERMISSIONS.WORKFORCE_READ, projectScoped: false },
  { kind: 'retention_schedule', permission: PERMISSIONS.BILLING_READ, projectScoped: false },
  { kind: 'inventory_movement', permission: PERMISSIONS.ASSETS_READ, projectScoped: false },
  { kind: 'compliance_expiry', permission: PERMISSIONS.COMPLIANCE_READ, projectScoped: false },
  { kind: 'crm_funnel', permission: PERMISSIONS.CRM_READ, projectScoped: false },
  { kind: 'month_close_completeness', permission: PERMISSIONS.MONTH_CLOSE_READ, projectScoped: false },
  { kind: 'safety_open_actions', permission: PERMISSIONS.SAFETY_READ, projectScoped: false },
  { kind: 'purchase_order', permission: PERMISSIONS.PROCUREMENT_READ, projectScoped: false },
  { kind: 'procurement_rfq', permission: PERMISSIONS.PROCUREMENT_READ, projectScoped: false },
  { kind: 'customer_statement', permission: PERMISSIONS.BILLING_READ, projectScoped: false },
  { kind: 'contract_summary', permission: PERMISSIONS.CONTRACTS_READ, projectScoped: false },
  { kind: 'work_order', permission: PERMISSIONS.SERVICE_READ, projectScoped: false },
  { kind: 'service_completion', permission: PERMISSIONS.SERVICE_READ, projectScoped: false },
  { kind: 'timesheet', permission: PERMISSIONS.WORKFORCE_READ, projectScoped: false },
  {
    kind: 'project_billing_account',
    permission: PERMISSIONS.BILLING_READ,
    projectScoped: true,
  },
  {
    kind: 'project_billing_plan_status',
    permission: PERMISSIONS.BILLING_READ,
    projectScoped: true,
  },
] as const;

const BY_KIND = new Map(REPORT_KIND_DEFINITIONS.map((item) => [item.kind, item]));

export function isReportKind(value: string): value is ReportKind {
  return (REPORT_KINDS as readonly string[]).includes(value);
}

export function reportKindDefinition(kind: ReportKind): ReportKindDefinition {
  const found = BY_KIND.get(kind);
  if (!found) throw new ValidationError([{ path: 'kind', message: 'Unknown report kind' }]);
  return found;
}

export function requiredPermissionForKind(kind: ReportKind): PermissionKey {
  return reportKindDefinition(kind).permission;
}

export function assertReportKindPermission(context: OrgContext, kind: ReportKind): void {
  assertPermission(context, requiredPermissionForKind(kind));
}

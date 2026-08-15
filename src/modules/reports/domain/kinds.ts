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

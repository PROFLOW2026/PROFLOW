/**
 * Subcontract money gate (amounts, retention, value events, cash, advances).
 *
 * `vendors.read` alone is operational: who the contractor is, on which project, status, dates,
 * documents. Money additionally requires one of:
 *  - org permission `project_financials.read` (project cost visibility; Owner / Manager / Finance)
 *  - org permission `ap.read` (vendor bills tagged to the agreement and commitment rollups)
 *  - org permission `vendors.manage` (the people who enter subcontract amounts and changes)
 *  - project capability `contract.financial.view` on the agreement's project
 *
 * Mirrored in SQL by `app.subcontract_money_visible(org, project)` (migration 0168).
 */

import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError } from '@/shared/errors';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { PROJECT_CAPABILITIES, hasProjectCapability } from '@/modules/project-team';

export function hasOrgSubcontractFinancialAccess(context: OrgContext): boolean {
  return (
    hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ) ||
    hasPermission(context, PERMISSIONS.AP_READ) ||
    hasPermission(context, PERMISSIONS.VENDORS_MANAGE)
  );
}

export async function canViewSubcontractFinancials(
  context: OrgContext,
  projectId: string,
): Promise<boolean> {
  if (hasOrgSubcontractFinancialAccess(context)) return true;
  return hasProjectCapability(context, projectId, PROJECT_CAPABILITIES.CONTRACT_FINANCIAL_VIEW);
}

export async function assertSubcontractFinancialAccess(
  context: OrgContext,
  projectId: string,
): Promise<void> {
  if (!(await canViewSubcontractFinancials(context, projectId))) {
    throw new AuthorizationError('subcontract.financial');
  }
}

/** Distinct project ids (of the given set) whose subcontract money this viewer may load. */
export async function resolveSubcontractFinancialProjectIds(
  context: OrgContext,
  projectIds: Iterable<string>,
): Promise<ReadonlySet<string>> {
  const distinct = new Set(projectIds);
  if (hasOrgSubcontractFinancialAccess(context)) return distinct;
  const allowed = new Set<string>();
  for (const projectId of distinct) {
    if (
      await hasProjectCapability(context, projectId, PROJECT_CAPABILITIES.CONTRACT_FINANCIAL_VIEW)
    ) {
      allowed.add(projectId);
    }
  }
  return allowed;
}

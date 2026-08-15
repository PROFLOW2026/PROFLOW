import { getOrganizationProjectRollup } from '@/modules/financials/application/get-organization-project-rollup';
import { resolveAccessibleProjectIds } from '@/modules/projects/application/project-access';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { evaluateEarlyWarnings } from '../domain/evaluate-warnings';
import type { EarlyWarning } from '../domain/types';
import { loadActiveBudgetAmountsForOrg } from './get-project-warnings';

const PER_PROJECT_CAP = 4;
const ORG_CAP = 40;

export async function getOrganizationEarlyWarnings(
  context: OrgContext,
): Promise<readonly EarlyWarning[]> {
  if (!hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ)) return [];

  const allowed = await resolveAccessibleProjectIds(context);
  const canReadBudget = hasPermission(context, PERMISSIONS.BUDGETS_READ);
  const canReadBilling = hasPermission(context, PERMISSIONS.BILLING_READ);
  const canReadProfit = hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ);

  const [rollup, budgets] = await Promise.all([
    getOrganizationProjectRollup(context),
    canReadBudget ? loadActiveBudgetAmountsForOrg(context) : Promise.resolve(new Map()),
  ]);

  const out: EarlyWarning[] = [];
  for (const row of rollup.rows) {
    if (allowed !== null && !allowed.includes(row.projectId)) continue;
    const budget = budgets.get(row.projectId);
    const budgetAmount =
      budget && budget.currency === row.currency ? budget.amount : null;
    const warnings = evaluateEarlyWarnings({
      projectId: row.projectId,
      workKind: row.workKind,
      currency: row.currency,
      priceNotSet: row.priceNotSet,
      currentContractAmount: row.currentContract?.amount ?? null,
      actualCostAmount: row.actualCost?.amount ?? null,
      forecastFinalCostAmount: row.estimatedFinalCost?.amount ?? null,
      committedOpenAmount: row.committedOpen?.amount ?? null,
      expectedRemainingAmount: row.expectedRemainingCost?.amount ?? null,
      invoicedAmount: row.invoiced?.amount ?? null,
      outstandingAmount: row.outstanding?.amount ?? null,
      actualMarginPercent: row.actualMarginPercent,
      forecastMarginPercent: row.marginPercent,
      budgetAmount,
      progressPercent: row.progressPercent,
      dataConfidenceLevel: 'high',
      canReadProfit,
      canReadBudget,
      canReadBilling,
    }).slice(0, PER_PROJECT_CAP);
    out.push(...warnings);
    if (out.length >= ORG_CAP) break;
  }

  return out.slice(0, ORG_CAP);
}

import { and, eq } from 'drizzle-orm';
import { projects } from '@drizzle/schema';
import { getActiveBudgetAmountsForOrg, getActiveBudgetForProject } from '@/modules/budgets';
import { getProjectFinancials } from '@/modules/financials/application/get-project-financials';
import { assertCanAccessProject } from '@/modules/projects/application/project-access';
import { getModuleVisibility } from '@/modules/tenancy';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { evaluateEarlyWarnings } from '../domain/evaluate-warnings';
import type { EarlyWarning } from '../domain/types';
import { mapFinancialsToWarningInput } from './map-financials-to-warning-input';

export async function getProjectEarlyWarnings(
  context: OrgContext,
  projectId: string,
): Promise<readonly EarlyWarning[]> {
  if (!hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ)) return [];
  await assertCanAccessProject(context, projectId);

  const financials = await getProjectFinancials(context, projectId);
  const modules = await getModuleVisibility(context);
  const canReadBudget = hasPermission(context, PERMISSIONS.BUDGETS_READ) && Boolean(modules.budgets);
  const canReadBilling = hasPermission(context, PERMISSIONS.BILLING_READ);
  const canReadProfit = hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ);

  let budgetAmount: string | null = null;
  if (canReadBudget) {
    const budget = await getActiveBudgetForProject(context, projectId);
    if (budget?.currency === financials.currency) {
      budgetAmount = budget.totalBudgetAmount;
    }
  }

  const [project] = await context.db
    .select({ progressPercent: projects.progressPercent })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, context.organizationId)))
    .limit(1);

  return evaluateEarlyWarnings(
    mapFinancialsToWarningInput({
      financials,
      budgetAmount,
      progressPercent: project?.progressPercent ?? null,
      canReadBudget,
      canReadBilling,
      canReadProfit,
    }),
  );
}

export async function loadActiveBudgetAmountsForOrg(
  context: OrgContext,
): Promise<Map<string, { amount: string; currency: string }>> {
  return getActiveBudgetAmountsForOrg(context);
}

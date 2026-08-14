import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { canAccessOverheadHome, type OverheadAllocationRunSummary } from '../domain/overhead-home';
import type { CostCategoryRow, ExpenseSummary } from '../domain/types';
import { listRecentAllocationRuns } from '../data/allocation-runs.repository';
import { listCostCategoriesForOrg, listExpensesForOrg } from './queries';

export type OverheadHomeResult =
  | { readonly allowed: false }
  | {
      readonly allowed: true;
      readonly overheadExpenses: readonly ExpenseSummary[];
      readonly overheadTotal: number;
      readonly sharedExpenses: readonly ExpenseSummary[];
      readonly sharedTotal: number;
      readonly allocationRuns: readonly OverheadAllocationRunSummary[];
      readonly overheadCategories: readonly CostCategoryRow[];
      readonly sharedCategories: readonly CostCategoryRow[];
      readonly canCreate: boolean;
      readonly canManageCategories: boolean;
    };

export async function getOverheadHome(context: OrgContext): Promise<OverheadHomeResult> {
  if (!canAccessOverheadHome(context.permissions)) {
    return { allowed: false };
  }

  const [overhead, shared, allocationRuns, overheadCategories, sharedCategories] = await Promise.all([
    listExpensesForOrg(context, { costFamily: 'business_overhead', limit: 25 }),
    listExpensesForOrg(context, { costFamily: 'shared', limit: 25 }),
    listRecentAllocationRuns(context.db, context.organizationId, { limit: 20 }),
    listCostCategoriesForOrg(context, 'business_overhead'),
    listCostCategoriesForOrg(context, 'shared'),
  ]);

  return {
    allowed: true,
    overheadExpenses: overhead.items,
    overheadTotal: overhead.total,
    sharedExpenses: shared.items,
    sharedTotal: shared.total,
    allocationRuns,
    overheadCategories,
    sharedCategories,
    canCreate: hasPermission(context, PERMISSIONS.EXPENSES_CREATE),
    canManageCategories: hasPermission(context, PERMISSIONS.SETTINGS_MANAGE),
  };
}

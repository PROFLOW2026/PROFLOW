import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { CostFamily } from '../domain/types';
import {
  findExpenseById,
  listCostCategories,
  listExpenses,
  countExpensesNeedingAttentionForOrg as countExpensesNeedingAttentionRows,
  listProjectsForOrganization,
  listWorkPackagesForProject,
  type ExpenseListFilters,
} from '../data/expenses.repository';

export async function getExpense(context: OrgContext, expenseId: string) {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);
  const expense = await findExpenseById(context.db, context.organizationId, expenseId);
  if (!expense) throw new NotFoundError('Expense');
  return expense;
}

export async function listExpensesForOrg(context: OrgContext, filters: ExpenseListFilters = {}) {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);
  return listExpenses(context.db, context.organizationId, filters);
}

export async function countExpensesNeedingAttentionForOrg(context: OrgContext): Promise<number> {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);
  return countExpensesNeedingAttentionRows(context.db, context.organizationId);
}

export async function listCostCategoriesForOrg(context: OrgContext, family?: CostFamily) {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);
  return listCostCategories(context.db, context.organizationId, family);
}

export async function listProjectsForOrg(context: OrgContext) {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);
  return listProjectsForOrganization(context.db, context.organizationId);
}

export async function listWorkPackagesForOrg(context: OrgContext, projectId: string) {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);
  return listWorkPackagesForProject(context.db, context.organizationId, projectId);
}

import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  isAccessibleProjectId,
  resolveAccessibleProjectIds,
} from '@/modules/projects/application/project-access';
import {
  employeeHasPermission,
  employeePermissionScope,
  isEmployeeAppUser,
} from '@/modules/employee-app/application/load-employee-app-context';
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

export interface ExpenseListScopeMeta {
  readonly scopeLimited: boolean;
  readonly scopeEmpty: boolean;
}

export interface ExpenseListResult {
  readonly items: Awaited<ReturnType<typeof listExpenses>>['items'];
  readonly total: number;
  readonly scope: ExpenseListScopeMeta;
}

async function resolveExpenseAccessibleProjectIds(
  context: OrgContext,
): Promise<string[] | undefined> {
  if (isEmployeeAppUser(context)) {
    if (!employeeHasPermission(context, PERMISSIONS.EXPENSES_READ)) return [];
    if (employeePermissionScope(context, PERMISSIONS.EXPENSES_READ) === 'all_organization') {
      return undefined;
    }
    const { resolveAccessibleProjectIdsForEmployeePermission } = await import(
      '@/modules/employee-app/application/project-scope'
    );
    const allowed = await resolveAccessibleProjectIdsForEmployeePermission(
      context,
      PERMISSIONS.EXPENSES_READ,
    );
    if (allowed === null) return undefined;
    return allowed;
  }

  const allowed = await resolveAccessibleProjectIds(context);
  if (allowed === null) return undefined;
  return allowed;
}

function expenseMatchesAccessibleProjects(
  allowed: readonly string[],
  expense: {
    readonly projectId: string | null;
    readonly allocations?: readonly { readonly projectId: string | null }[];
  },
): boolean {
  if (expense.projectId && allowed.includes(expense.projectId)) return true;
  return (
    expense.allocations?.some(
      (line) => line.projectId != null && allowed.includes(line.projectId),
    ) ?? false
  );
}

function assertExpenseAccessible(
  allowed: string[] | undefined,
  expense: {
    readonly projectId: string | null;
    readonly allocations?: readonly { readonly projectId: string | null }[];
  },
): void {
  if (allowed === undefined) return;
  if (!expenseMatchesAccessibleProjects(allowed, expense)) {
    throw new NotFoundError('Expense');
  }
}

function withAccessibleProjectFilter<T extends ExpenseListFilters>(
  filters: T,
  accessibleProjectIds: string[] | undefined,
): T {
  if (accessibleProjectIds === undefined) return filters;
  return { ...filters, accessibleProjectIds };
}

export async function getExpense(context: OrgContext, expenseId: string) {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);
  const accessibleProjectIds = await resolveExpenseAccessibleProjectIds(context);
  const expense = await findExpenseById(context.db, context.organizationId, expenseId);
  if (!expense) throw new NotFoundError('Expense');
  assertExpenseAccessible(accessibleProjectIds, expense);
  return expense;
}

export async function listExpensesForOrg(
  context: OrgContext,
  filters: ExpenseListFilters = {},
): Promise<ExpenseListResult> {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);
  const accessibleProjectIds = await resolveExpenseAccessibleProjectIds(context);
  const scopeLimited = accessibleProjectIds !== undefined;
  const scopeEmpty = scopeLimited && accessibleProjectIds.length === 0;

  if (scopeEmpty) {
    return {
      items: [],
      total: 0,
      scope: { scopeLimited: true, scopeEmpty: true },
    };
  }

  const result = await listExpenses(
    context.db,
    context.organizationId,
    withAccessibleProjectFilter(filters, accessibleProjectIds),
  );

  return {
    ...result,
    scope: { scopeLimited, scopeEmpty: false },
  };
}

export async function countExpensesNeedingAttentionForOrg(context: OrgContext): Promise<number> {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);
  const accessibleProjectIds = await resolveExpenseAccessibleProjectIds(context);
  return countExpensesNeedingAttentionRows(
    context.db,
    context.organizationId,
    accessibleProjectIds,
  );
}

export async function listCostCategoriesForOrg(context: OrgContext, family?: CostFamily) {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);
  return listCostCategories(context.db, context.organizationId, family);
}

export async function listProjectsForOrg(context: OrgContext) {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);
  const rows = await listProjectsForOrganization(context.db, context.organizationId);
  const allowed = await resolveAccessibleProjectIds(context);
  if (allowed === null) return rows;
  return rows.filter((row) => isAccessibleProjectId(allowed, row.id));
}

export async function listWorkPackagesForOrg(context: OrgContext, projectId: string) {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);
  const allowed = await resolveAccessibleProjectIds(context);
  if (allowed !== null && !allowed.includes(projectId)) {
    throw new NotFoundError('Project');
  }
  return listWorkPackagesForProject(context.db, context.organizationId, projectId);
}

import { and, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { costCategories, expenseAllocations, expenses, vendors } from '@drizzle/schema';
import type { BusinessDate } from '@/shared/dates';
import {
  divideMoney,
  fromNumericString,
  isZeroMoney,
  multiplyMoney,
  roundMoney,
  sumMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { DbExecutor } from '@/shared/db/types';
import type { DbCostFamily, ProjectExpenseContribution } from '../domain/cost-aggregation';
import { isLaborCostCategoryKey } from '../domain/labor-expense-integrity';
import { sqlFirstRow } from './sql-rows';

export async function loadProjectExpenseContributions(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectExpenseContribution[]> {
  return loadExpenseContributions(db, organizationId, { projectId });
}

/**
 * Org-scoped expense contributions for dashboard coverage (one pass, not per project).
 * Only rows that touch a project (direct or allocated) are included.
 */
export async function loadOrganizationExpenseContributions(
  db: DbExecutor,
  organizationId: string,
): Promise<ProjectExpenseContribution[]> {
  return loadExpenseContributions(db, organizationId, {});
}

/**
 * Set-scoped contributions for batch financial compose (jobs list / rollup subset).
 * Same recognition rules as org-wide load — filtered to the requested project ids
 * so list requests do not pull every org expense contribution.
 */
export async function loadExpenseContributionsForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
): Promise<ProjectExpenseContribution[]> {
  if (projectIds.length === 0) return [];
  return loadExpenseContributions(db, organizationId, { projectIds });
}

async function loadExpenseContributions(
  db: DbExecutor,
  organizationId: string,
  scope: { readonly projectId?: string; readonly projectIds?: readonly string[] },
): Promise<ProjectExpenseContribution[]> {
  const directFilters = [
    eq(expenses.organizationId, organizationId),
    eq(expenses.status, 'finalized'),
    isNull(expenses.archivedAt),
  ];
  if (scope.projectId) {
    directFilters.push(eq(expenses.projectId, scope.projectId));
  } else if (scope.projectIds && scope.projectIds.length > 0) {
    directFilters.push(inArray(expenses.projectId, [...scope.projectIds]));
  } else {
    directFilters.push(isNotNull(expenses.projectId));
  }

  const directRows = await db
    .select({
      expenseId: expenses.id,
      netAmount: expenses.netAmount,
      currency: expenses.currency,
      costFamily: expenses.costFamily,
      vendorType: vendors.type,
      projectId: expenses.projectId,
      categoryKey: costCategories.key,
      workPackageId: expenses.workPackageId,
    })
    .from(expenses)
    .leftJoin(vendors, eq(vendors.id, expenses.vendorId))
    .leftJoin(costCategories, eq(costCategories.id, expenses.costCategoryId))
    .where(and(...directFilters));

  const allocationFilters = [
    eq(expenseAllocations.organizationId, organizationId),
    eq(expenses.status, 'finalized'),
    isNull(expenses.archivedAt),
  ];
  if (scope.projectId) {
    allocationFilters.push(eq(expenseAllocations.projectId, scope.projectId));
  } else if (scope.projectIds && scope.projectIds.length > 0) {
    allocationFilters.push(inArray(expenseAllocations.projectId, [...scope.projectIds]));
  } else {
    allocationFilters.push(isNotNull(expenseAllocations.projectId));
  }

  const lineCategories = alias(costCategories, 'expense_alloc_line_cat');

  const allocationRows = await db
    .select({
      expenseId: expenses.id,
      amount: expenseAllocations.amount,
      currency: expenseAllocations.currency,
      amountBasis: expenseAllocations.amountBasis,
      costFamily: expenses.costFamily,
      vendorType: vendors.type,
      parentNetAmount: expenses.netAmount,
      parentGrossAmount: expenses.grossAmount,
      projectId: expenseAllocations.projectId,
      parentCategoryKey: costCategories.key,
      lineCategoryKey: lineCategories.key,
      workPackageId: expenseAllocations.workPackageId,
    })
    .from(expenseAllocations)
    .innerJoin(expenses, eq(expenses.id, expenseAllocations.expenseId))
    .leftJoin(vendors, eq(vendors.id, expenses.vendorId))
    .leftJoin(costCategories, eq(costCategories.id, expenses.costCategoryId))
    .leftJoin(lineCategories, eq(lineCategories.id, expenseAllocations.costCategoryId))
    .where(and(...allocationFilters));

  const contributions: ProjectExpenseContribution[] = [];

  for (const row of directRows) {
    contributions.push({
      // Profitability uses NET — VAT must not inflate Actual Cost / margin.
      amount: row.netAmount,
      currency: row.currency,
      costFamily: row.costFamily as DbCostFamily,
      isDirectOnProject: true,
      isAllocated: false,
      isSubcontractor: isSubcontractorVendor(row.vendorType),
      projectId: row.projectId,
      isLaborCategory: isLaborCostCategoryKey(row.categoryKey),
      expenseId: row.expenseId,
      categoryKey: row.categoryKey,
      workPackageId: row.workPackageId,
    });
  }

  for (const row of allocationRows) {
    const amountBasis = row.amountBasis === 'net' ? 'net' : 'gross';
    contributions.push({
      amount:
        amountBasis === 'net'
          ? row.amount
          : netShareOfAllocationLine(
              row.amount,
              row.parentNetAmount,
              row.parentGrossAmount,
              row.currency,
            ),
      currency: row.currency,
      costFamily: row.costFamily as DbCostFamily,
      isDirectOnProject: false,
      isAllocated: true,
      isSubcontractor: isSubcontractorVendor(row.vendorType),
      projectId: row.projectId,
      // Line category overrides parent when set; Mode B labor is usually on the parent.
      isLaborCategory: isLaborCostCategoryKey(row.lineCategoryKey ?? row.parentCategoryKey),
      expenseId: row.expenseId,
      categoryKey: row.lineCategoryKey ?? row.parentCategoryKey,
      workPackageId: row.workPackageId,
    });
  }

  return contributions;
}

/**
 * Allocation lines may be captured against gross (invoice UX) or net (automatic
 * weight engine). Project Actual / profit use NET: scale gross lines; pass
 * net-basis lines through unchanged.
 */
function netShareOfAllocationLine(
  lineAmount: string,
  parentNetAmount: string,
  parentGrossAmount: string,
  currency: string,
): string {
  const line = fromNumericString(lineAmount, currency);
  const net = fromNumericString(parentNetAmount, currency);
  const gross = fromNumericString(parentGrossAmount, currency);
  if (!line || !net || !gross) return '0';
  if (isZeroMoney(gross)) return '0';
  if (net.amount === gross.amount) return line.amount;
  return roundMoney(divideMoney(multiplyMoney(line, net.amount), gross.amount)).amount;
}

function isSubcontractorVendor(type: string | null): boolean {
  return type === 'subcontractor' || type === 'both';
}

export async function sumOrganizationCostsInDateRange(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  fromDate: BusinessDate,
  toDate: BusinessDate,
): Promise<MoneyValue> {
  const directRows = await db
    .select({ netAmount: expenses.netAmount, currency: expenses.currency })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, organizationId),
        eq(expenses.currency, currency),
        eq(expenses.status, 'finalized'),
        isNull(expenses.archivedAt),
        gte(expenses.expenseDate, fromDate),
        lte(expenses.expenseDate, toDate),
        or(isNull(expenses.recurringTemplateId), sql`true`),
      ),
    );

  const values = directRows
    .map((row) => fromNumericString(row.netAmount, row.currency))
    .filter((value): value is MoneyValue => value !== null);

  if (values.length === 0) return zeroMoney(currency);
  return sumMoney(values, currency);
}

export async function hasAnyExpenseUsage(
  db: DbExecutor,
  organizationId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, organizationId),
        eq(expenses.status, 'finalized'),
        isNull(expenses.archivedAt),
      ),
    )
    .limit(1);

  return Boolean(row);
}

/**
 * Org-wide finalized expense NET total (includes unallocated overhead).
 * Prefer project-loaded aggregation (`aggregateProjectCosts`) for home/project profit KPIs.
 */
export async function sumOrganizationActualCosts(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<{ total: MoneyValue; hasExpenseData: boolean }> {
  const row = sqlFirstRow<{ total: string; count: number }>(
    await db.execute(sql`
      select coalesce(sum(e.net_amount), 0)::text as total, count(*)::int as count
      from expenses e
      where e.organization_id = ${organizationId}
        and e.currency = ${currency}
        and e.status = 'finalized'
        and e.archived_at is null
    `),
  );

  const total = fromNumericString(row?.total ?? '0', currency) ?? zeroMoney(currency);
  return { total, hasExpenseData: (row?.count ?? 0) > 0 };
}

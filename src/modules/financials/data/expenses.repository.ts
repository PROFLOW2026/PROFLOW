import { and, eq, gte, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { expenseAllocations, expenses, vendors } from '@drizzle/schema';
import type { BusinessDate } from '@/shared/dates';
import { fromNumericString, sumMoney, zeroMoney, type MoneyValue } from '@/shared/money';
import type { DbExecutor } from '@/shared/db/types';
import type { DbCostFamily, ProjectExpenseContribution } from '../domain/cost-aggregation';
import { sqlFirstRow } from './sql-rows';

export async function loadProjectExpenseContributions(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectExpenseContribution[]> {
  return loadExpenseContributions(db, organizationId, projectId);
}

/**
 * Org-scoped expense contributions for dashboard coverage (one pass, not per project).
 * Only rows that touch a project (direct or allocated) are included.
 */
export async function loadOrganizationExpenseContributions(
  db: DbExecutor,
  organizationId: string,
): Promise<ProjectExpenseContribution[]> {
  return loadExpenseContributions(db, organizationId);
}

async function loadExpenseContributions(
  db: DbExecutor,
  organizationId: string,
  projectId?: string,
): Promise<ProjectExpenseContribution[]> {
  const directFilters = [
    eq(expenses.organizationId, organizationId),
    eq(expenses.status, 'finalized'),
    isNull(expenses.archivedAt),
  ];
  if (projectId) {
    directFilters.push(eq(expenses.projectId, projectId));
  } else {
    directFilters.push(isNotNull(expenses.projectId));
  }

  const directRows = await db
    .select({
      grossAmount: expenses.grossAmount,
      currency: expenses.currency,
      costFamily: expenses.costFamily,
      vendorType: vendors.type,
    })
    .from(expenses)
    .leftJoin(vendors, eq(vendors.id, expenses.vendorId))
    .where(and(...directFilters));

  const allocationFilters = [
    eq(expenseAllocations.organizationId, organizationId),
    eq(expenses.status, 'finalized'),
    isNull(expenses.archivedAt),
  ];
  if (projectId) {
    allocationFilters.push(eq(expenseAllocations.projectId, projectId));
  } else {
    allocationFilters.push(isNotNull(expenseAllocations.projectId));
  }

  const allocationRows = await db
    .select({
      amount: expenseAllocations.amount,
      currency: expenseAllocations.currency,
      costFamily: expenses.costFamily,
      vendorType: vendors.type,
      targetType: expenseAllocations.targetType,
    })
    .from(expenseAllocations)
    .innerJoin(expenses, eq(expenses.id, expenseAllocations.expenseId))
    .leftJoin(vendors, eq(vendors.id, expenses.vendorId))
    .where(and(...allocationFilters));

  const contributions: ProjectExpenseContribution[] = [];

  for (const row of directRows) {
    contributions.push({
      amount: row.grossAmount,
      currency: row.currency,
      costFamily: row.costFamily as DbCostFamily,
      isDirectOnProject: true,
      isAllocated: false,
      isSubcontractor: isSubcontractorVendor(row.vendorType),
    });
  }

  for (const row of allocationRows) {
    contributions.push({
      amount: row.amount,
      currency: row.currency,
      costFamily: row.costFamily as DbCostFamily,
      isDirectOnProject: false,
      isAllocated: true,
      isSubcontractor: isSubcontractorVendor(row.vendorType),
    });
  }

  return contributions;
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
    .select({ grossAmount: expenses.grossAmount, currency: expenses.currency })
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
    .map((row) => fromNumericString(row.grossAmount, row.currency))
    .filter((value): value is MoneyValue => value !== null);

  if (values.length === 0) return zeroMoney(currency);
  return sumMoney(values, currency);
}

export async function hasAnyExpenseUsage(
  db: DbExecutor,
  organizationId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, organizationId),
        eq(expenses.status, 'finalized'),
        isNull(expenses.archivedAt),
      ),
    );

  return (row?.count ?? 0) > 0;
}

export async function sumOrganizationActualCosts(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<{ total: MoneyValue; hasExpenseData: boolean }> {
  const row = sqlFirstRow<{ total: string; count: number }>(
    await db.execute(sql`
      select coalesce(sum(e.gross_amount), 0)::text as total, count(*)::int as count
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

/**
 * Inventory cost consumption loaders for Project / Company Actual.
 *
 * project_consume → Project Actual (materials) via compose addend / contribution fold.
 * writeoff → General Pool (sumInventoryWriteoffsForMonth).
 * Remaining stock cost_basis is NEVER General Pool / operating Actual.
 */

import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { inventoryCostConsumptions } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import {
  fromNumericString,
  toDecimalValue,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { ProjectExpenseContribution } from '../domain/cost-aggregation';
import { sqlFirstRow, sqlRows } from './sql-rows';

const YEAR_MONTH_RE = /^([0-9]{4})-(0[1-9]|1[0-2])$/;

function yearMonthDateBounds(yearMonth: string): { startDate: string; endDate: string } {
  const trimmed = yearMonth.trim();
  if (!YEAR_MONTH_RE.test(trimmed)) {
    throw new Error(`Invalid yearMonth "${yearMonth}" (expected YYYY-MM)`);
  }
  const [yearPart, monthPart] = trimmed.split('-');
  const lastDay = new Date(Date.UTC(Number(yearPart), Number(monthPart), 0)).getUTCDate();
  return {
    startDate: `${trimmed}-01`,
    endDate: `${trimmed}-${String(lastDay).padStart(2, '0')}`,
  };
}

/**
 * Sum FIFO project_consume amounts for one project (operating Actual materials).
 */
export async function sumInventoryConsumptionsForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<MoneyValue> {
  const normalized = currency.toUpperCase();
  const row = sqlFirstRow<{ total: string }>(
    await db.execute(sql`
      select coalesce(sum(c.amount), 0)::text as total
      from inventory_cost_consumptions c
      where c.organization_id = ${organizationId}
        and c.project_id = ${projectId}
        and c.currency = ${normalized}
        and c.kind = 'project_consume'
    `),
  );
  return fromNumericString(row?.total ?? '0', normalized) ?? zeroMoney(normalized);
}

/**
 * Batch sum project_consume by project id (jobs list / rollup).
 */
export async function sumInventoryConsumptionsForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
  currency: string,
): Promise<Map<string, MoneyValue>> {
  const normalized = currency.toUpperCase();
  const result = new Map<string, MoneyValue>();
  for (const id of projectIds) {
    result.set(id, zeroMoney(normalized));
  }
  if (projectIds.length === 0) return result;

  const rows = await db
    .select({
      projectId: inventoryCostConsumptions.projectId,
      total: sql<string>`coalesce(sum(${inventoryCostConsumptions.amount}), 0)::text`,
    })
    .from(inventoryCostConsumptions)
    .where(
      and(
        eq(inventoryCostConsumptions.organizationId, organizationId),
        inArray(inventoryCostConsumptions.projectId, [...projectIds]),
        eq(inventoryCostConsumptions.currency, normalized),
        eq(inventoryCostConsumptions.kind, 'project_consume'),
        isNotNull(inventoryCostConsumptions.projectId),
      ),
    )
    .groupBy(inventoryCostConsumptions.projectId);

  for (const row of rows) {
    if (!row.projectId) continue;
    result.set(
      row.projectId,
      fromNumericString(row.total, normalized) ?? zeroMoney(normalized),
    );
  }
  return result;
}

/**
 * Expense-like contributions for compose fold (category materials).
 * Lead can concat with loadExpenseContributions* before aggregateProjectCosts,
 * OR add as dedicated compose addend — same amounts either way.
 *
 * No expenseId → expense↔AP dedup does not touch these rows.
 */
export async function loadInventoryConsumptionContributionsForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
): Promise<ProjectExpenseContribution[]> {
  if (projectIds.length === 0) return [];

  const rows = await db
    .select({
      projectId: inventoryCostConsumptions.projectId,
      amount: sql<string>`coalesce(sum(${inventoryCostConsumptions.amount}), 0)::text`,
      currency: inventoryCostConsumptions.currency,
    })
    .from(inventoryCostConsumptions)
    .where(
      and(
        eq(inventoryCostConsumptions.organizationId, organizationId),
        inArray(inventoryCostConsumptions.projectId, [...projectIds]),
        eq(inventoryCostConsumptions.kind, 'project_consume'),
        isNotNull(inventoryCostConsumptions.projectId),
      ),
    )
    .groupBy(inventoryCostConsumptions.projectId, inventoryCostConsumptions.currency);

  const contributions: ProjectExpenseContribution[] = [];
  for (const row of rows) {
    if (!row.projectId) continue;
    const amount = fromNumericString(row.amount, row.currency);
    if (!amount || toDecimalValue(amount).eq(0)) continue;
    contributions.push({
      amount: row.amount,
      currency: row.currency,
      costFamily: 'direct_project',
      isDirectOnProject: true,
      isAllocated: false,
      isSubcontractor: false,
      projectId: row.projectId,
      isLaborCategory: false,
      expenseId: null,
      categoryKey: 'materials',
      workPackageId: null,
      vendorId: null,
      vendorName: null,
      vendorType: null,
    });
  }
  return contributions;
}

export async function loadInventoryConsumptionContributionsForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectExpenseContribution[]> {
  return loadInventoryConsumptionContributionsForProjects(db, organizationId, [projectId]);
}

/** Org-wide project_consume rows grouped by project — one load per Financials request. */
export async function loadOrganizationInventoryConsumptionContributions(
  db: DbExecutor,
  organizationId: string,
): Promise<ProjectExpenseContribution[]> {
  const rows = await db
    .select({
      projectId: inventoryCostConsumptions.projectId,
      amount: sql<string>`coalesce(sum(${inventoryCostConsumptions.amount}), 0)::text`,
      currency: inventoryCostConsumptions.currency,
    })
    .from(inventoryCostConsumptions)
    .where(
      and(
        eq(inventoryCostConsumptions.organizationId, organizationId),
        eq(inventoryCostConsumptions.kind, 'project_consume'),
        isNotNull(inventoryCostConsumptions.projectId),
      ),
    )
    .groupBy(inventoryCostConsumptions.projectId, inventoryCostConsumptions.currency);

  const contributions: ProjectExpenseContribution[] = [];
  for (const row of rows) {
    if (!row.projectId) continue;
    const amount = fromNumericString(row.amount, row.currency);
    if (!amount || toDecimalValue(amount).eq(0)) continue;
    contributions.push({
      amount: row.amount,
      currency: row.currency,
      costFamily: 'direct_project',
      isDirectOnProject: true,
      isAllocated: false,
      isSubcontractor: false,
      projectId: row.projectId,
      isLaborCategory: false,
      expenseId: null,
      categoryKey: 'materials',
      workPackageId: null,
      vendorId: null,
      vendorName: null,
      vendorType: null,
    });
  }
  return contributions;
}

/**
 * Write-off consumptions in a calendar month → General Pool source.
 * Stock remaining value is intentionally excluded.
 */
export async function sumInventoryWriteoffsForMonth(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  yearMonth: string,
): Promise<MoneyValue> {
  const normalized = currency.toUpperCase();
  const { startDate, endDate } = yearMonthDateBounds(yearMonth);
  const row = sqlFirstRow<{ total: string }>(
    await db.execute(sql`
      select coalesce(sum(c.amount), 0)::text as total
      from inventory_cost_consumptions c
      where c.organization_id = ${organizationId}
        and c.currency = ${normalized}
        and c.kind = 'writeoff'
        and c.occurred_on >= ${startDate}
        and c.occurred_on <= ${endDate}
    `),
  );
  return fromNumericString(row?.total ?? '0', normalized) ?? zeroMoney(normalized);
}

export async function sumInventoryWriteoffsGroupedByYearMonth(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  yearMonths: readonly string[],
): Promise<Map<string, MoneyValue>> {
  const result = new Map<string, MoneyValue>();
  if (yearMonths.length === 0) return result;
  const sorted = [...yearMonths].sort();
  const startDate = yearMonthDateBounds(sorted[0]!).startDate;
  const endDate = yearMonthDateBounds(sorted[sorted.length - 1]!).endDate;
  const normalized = currency.toUpperCase();
  const allowed = new Set(yearMonths);
  const rows = sqlRows<{ yearMonth: string; total: string }>(
    await db.execute(sql`
      select to_char(c.occurred_on::date, 'YYYY-MM') as "yearMonth",
             coalesce(sum(c.amount), 0)::text as total
      from inventory_cost_consumptions c
      where c.organization_id = ${organizationId}
        and c.currency = ${normalized}
        and c.kind = 'writeoff'
        and c.occurred_on >= ${startDate}
        and c.occurred_on <= ${endDate}
      group by 1
    `),
  );
  for (const row of rows) {
    if (!allowed.has(row.yearMonth)) continue;
    result.set(row.yearMonth, fromNumericString(row.total, normalized) ?? zeroMoney(normalized));
  }
  return result;
}

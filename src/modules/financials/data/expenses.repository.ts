import { and, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  costCategories,
  expenseAllocations,
  expenseManagerialScheduleLines,
  expenses,
  organizations,
  vendors,
} from '@drizzle/schema';
import { currentYearMonth } from '@/modules/month-close';
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
import { isInternalEmployeePayrollCategoryKey } from '../domain/labor-expense-integrity';
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
 * Same recognition rules as org-wide load - filtered to the requested project ids
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

/**
 * Project Actual expense contributions.
 *
 * Installment expenses (`installment_count` > 1 with managerial schedule lines)
 * contribute SUM(scheduled|recognized lines where year_month <= org current month),
 * not full NET on expense_date. Count 1 or no lines keep full NET (back-compat).
 *
 * Excludes `inventory_stock_purchase` — those book to inventory cost layers (stock
 * state), not operating Actual. Project material Actual comes from consumptions.
 */
async function loadExpenseContributions(
  db: DbExecutor,
  organizationId: string,
  scope: { readonly projectId?: string; readonly projectIds?: readonly string[] },
): Promise<ProjectExpenseContribution[]> {
  const directFilters = [
    eq(expenses.organizationId, organizationId),
    eq(expenses.status, 'finalized'),
    isNull(expenses.archivedAt),
    eq(expenses.inventoryStockPurchase, false),
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
      vendorId: expenses.vendorId,
      vendorName: vendors.name,
      vendorType: vendors.type,
      projectId: expenses.projectId,
      categoryKey: costCategories.key,
      classificationStatus: expenses.classificationStatus,
      workPackageId: expenses.workPackageId,
      installmentCount: expenses.installmentCount,
    })
    .from(expenses)
    .leftJoin(vendors, eq(vendors.id, expenses.vendorId))
    .leftJoin(costCategories, eq(costCategories.id, expenses.costCategoryId))
    .where(and(...directFilters));

  const allocationFilters = [
    eq(expenseAllocations.organizationId, organizationId),
    eq(expenses.status, 'finalized'),
    isNull(expenses.archivedAt),
    eq(expenses.inventoryStockPurchase, false),
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
      vendorId: expenses.vendorId,
      vendorName: vendors.name,
      vendorType: vendors.type,
      parentNetAmount: expenses.netAmount,
      parentGrossAmount: expenses.grossAmount,
      installmentCount: expenses.installmentCount,
      projectId: expenseAllocations.projectId,
      parentCategoryKey: costCategories.key,
      lineCategoryKey: lineCategories.key,
      classificationStatus: expenses.classificationStatus,
      workPackageId: expenseAllocations.workPackageId,
    })
    .from(expenseAllocations)
    .innerJoin(expenses, eq(expenses.id, expenseAllocations.expenseId))
    .leftJoin(vendors, eq(vendors.id, expenses.vendorId))
    .leftJoin(costCategories, eq(costCategories.id, expenses.costCategoryId))
    .leftJoin(lineCategories, eq(lineCategories.id, expenseAllocations.costCategoryId))
    .where(and(...allocationFilters));

  const installmentExpenseIds = [
    ...new Set(
      [...directRows, ...allocationRows]
        .filter((row) => row.installmentCount > 1)
        .map((row) => row.expenseId),
    ),
  ];
  const installmentRecognition = await loadInstallmentRecognitionByExpense(
    db,
    organizationId,
    installmentExpenseIds,
  );

  const contributions: ProjectExpenseContribution[] = [];

  for (const row of directRows) {
    contributions.push({
      // Profitability uses NET - VAT must not inflate Actual Cost / margin.
      // Multi-month managerial schedules contribute recognized-to-date, not future lines.
      amount: contributionAmountWithInstallments(
        row.netAmount,
        row.currency,
        row.installmentCount,
        row.netAmount,
        installmentRecognition.get(row.expenseId),
      ),
      currency: row.currency,
      costFamily: row.costFamily as DbCostFamily,
      isDirectOnProject: true,
      isAllocated: false,
      isSubcontractor: isSubcontractorVendor(row.vendorType),
      projectId: row.projectId,
      // Exclusion flag: internal employee payroll only (generic `labor` stays in Actual).
      isLaborCategory: isInternalEmployeePayrollCategoryKey(row.categoryKey),
      expenseId: row.expenseId,
      categoryKey: row.categoryKey,
      classificationStatus: row.classificationStatus,
      workPackageId: row.workPackageId,
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      vendorType: row.vendorType,
    });
  }

  for (const row of allocationRows) {
    const amountBasis = row.amountBasis === 'net' ? 'net' : 'gross';
    const allocatedNet =
      amountBasis === 'net'
        ? row.amount
        : netShareOfAllocationLine(
            row.amount,
            row.parentNetAmount,
            row.parentGrossAmount,
            row.currency,
          );
    contributions.push({
      amount: contributionAmountWithInstallments(
        allocatedNet,
        row.currency,
        row.installmentCount,
        row.parentNetAmount,
        installmentRecognition.get(row.expenseId),
      ),
      currency: row.currency,
      costFamily: row.costFamily as DbCostFamily,
      isDirectOnProject: false,
      isAllocated: true,
      isSubcontractor: isSubcontractorVendor(row.vendorType),
      projectId: row.projectId,
      // Line category overrides parent when set; exclusion is internal payroll only.
      isLaborCategory: isInternalEmployeePayrollCategoryKey(
        row.lineCategoryKey ?? row.parentCategoryKey,
      ),
      expenseId: row.expenseId,
      categoryKey: row.lineCategoryKey ?? row.parentCategoryKey,
      classificationStatus: row.classificationStatus,
      workPackageId: row.workPackageId,
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      vendorType: row.vendorType,
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
        and coalesce(e.inventory_stock_purchase, false) = false
    `),
  );

  const total = fromNumericString(row?.total ?? '0', currency) ?? zeroMoney(currency);
  return { total, hasExpenseData: (row?.count ?? 0) > 0 };
}

/**
 * Finalized expenses in a calendar month that do not touch a project
 * (no project_id and no expense_allocations lines) — monthly General Pool source.
 * Excludes inventory_stock_purchase (stock state, not operating Actual).
 *
 * Installment expenses (`installment_count` > 1 with schedule lines) contribute
 * only that month's schedule line, not full NET on expense_date.
 */
export async function sumUnallocatedExpensesForMonth(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  yearMonth: string,
): Promise<MoneyValue> {
  const row = sqlFirstRow<{ total: string }>(
    await db.execute(sql`
      select coalesce(sum(s.contrib), 0)::text as total
      from (
        select
          case
            when e.installment_count > 1 and exists (
              select 1
              from expense_managerial_schedule_lines l
              where l.expense_id = e.id
                and l.organization_id = e.organization_id
                and l.status in ('scheduled', 'recognized')
            )
            then coalesce((
              select sum(l2.amount)
              from expense_managerial_schedule_lines l2
              where l2.expense_id = e.id
                and l2.organization_id = e.organization_id
                and l2.year_month = ${yearMonth}
                and l2.status in ('scheduled', 'recognized')
            ), 0)
            else case
              when to_char(e.expense_date::date, 'YYYY-MM') = ${yearMonth} then e.net_amount
              else 0
            end
          end as contrib
        from expenses e
        where e.organization_id = ${organizationId}
          and e.currency = ${currency}
          and e.status = 'finalized'
          and e.archived_at is null
          and coalesce(e.inventory_stock_purchase, false) = false
          and e.project_id is null
          and not exists (
            select 1 from expense_allocations a
            where a.expense_id = e.id
              and a.organization_id = e.organization_id
              and a.project_id is not null
          )
      ) s
    `),
  );
  return fromNumericString(row?.total ?? '0', currency) ?? zeroMoney(currency);
}

interface InstallmentRecognition {
  readonly recognizedAmount: string;
  readonly hasActiveLines: boolean;
}

/**
 * installment_count = 1 or missing lines: keep full NET (back-compat).
 * installment_count > 1 with scheduled|recognized lines: recognized-to-date
 * through the organization current month (future lines excluded).
 */
async function loadInstallmentRecognitionByExpense(
  db: DbExecutor,
  organizationId: string,
  expenseIds: readonly string[],
): Promise<Map<string, InstallmentRecognition>> {
  const map = new Map<string, InstallmentRecognition>();
  if (expenseIds.length === 0) return map;

  const [org] = await db
    .select({ timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const throughYearMonth = currentYearMonth(org?.timezone ?? 'UTC');

  const rows = await db
    .select({
      expenseId: expenseManagerialScheduleLines.expenseId,
      yearMonth: expenseManagerialScheduleLines.yearMonth,
      amount: expenseManagerialScheduleLines.amount,
      currency: expenseManagerialScheduleLines.currency,
    })
    .from(expenseManagerialScheduleLines)
    .where(
      and(
        eq(expenseManagerialScheduleLines.organizationId, organizationId),
        inArray(expenseManagerialScheduleLines.expenseId, [...expenseIds]),
        inArray(expenseManagerialScheduleLines.status, ['scheduled', 'recognized']),
      ),
    );

  const grouped = new Map<string, { currency: string; recognized: MoneyValue[] }>();
  for (const row of rows) {
    let entry = grouped.get(row.expenseId);
    if (!entry) {
      entry = { currency: row.currency, recognized: [] };
      grouped.set(row.expenseId, entry);
    }
    if (row.yearMonth <= throughYearMonth) {
      const value = fromNumericString(row.amount, row.currency);
      if (value) entry.recognized.push(value);
    }
  }

  for (const [expenseId, entry] of grouped) {
    const recognized =
      entry.recognized.length === 0
        ? zeroMoney(entry.currency)
        : roundMoney(sumMoney(entry.recognized, entry.currency));
    map.set(expenseId, {
      hasActiveLines: true,
      recognizedAmount: recognized.amount,
    });
  }
  return map;
}

function contributionAmountWithInstallments(
  fullAmount: string,
  currency: string,
  installmentCount: number,
  parentNet: string,
  recognition: InstallmentRecognition | undefined,
): string {
  if (installmentCount <= 1 || !recognition?.hasActiveLines) return fullAmount;
  const recognized = fromNumericString(recognition.recognizedAmount, currency);
  const net = fromNumericString(parentNet, currency);
  const line = fromNumericString(fullAmount, currency);
  if (!recognized || !net || !line) return '0';
  if (isZeroMoney(net)) return '0';
  if (net.amount === recognized.amount) return fullAmount;
  return roundMoney(divideMoney(multiplyMoney(line, recognized.amount), net.amount)).amount;
}

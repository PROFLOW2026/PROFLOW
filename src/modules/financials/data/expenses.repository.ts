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
import { sqlFirstRow, sqlRows } from './sql-rows';

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

/**
 * Recognized org costs in a date range — expenses + AP vendor bills + labor.
 *
 * Cost types included:
 *  - Expenses: finalized, expenseDate in range. Expenses that are already captured
 *    by an accepted AP bill match are excluded to prevent double-counting.
 *  - AP bills: recognized status (open/partially_matched/matched), billDate in range.
 *    Uses netAmount (excl. VAT) as authoritative vendor cost.
 *  - Labor: employee_month_costs (draft/applied/closed), yearMonth overlapping the range.
 *
 * This replaces the legacy `sumOrganizationCostsInDateRange` for the home dashboard
 * "costs this month" KPI so that the figure reflects full recognized cost, not just
 * finalized expense rows.
 */
export async function sumOrganizationRecognizedCostsInDateRange(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  fromDate: BusinessDate,
  toDate: BusinessDate,
): Promise<MoneyValue> {
  const row = sqlFirstRow<{ total: string }>(
    await db.execute(sql`
      SELECT coalesce(sum(s.amount), 0)::text AS total
      FROM (
        -- 1. Finalized expenses whose cost is NOT already covered by a recognized AP bill.
        --    An expense is excluded when it has at least one accepted match to a recognized
        --    bill (open/partially_matched/matched) so the AP bill amount is authoritative.
        SELECT e.net_amount::numeric AS amount
        FROM expenses e
        WHERE e.organization_id = ${organizationId}
          AND e.currency = ${currency}
          AND e.status = 'finalized'
          AND e.archived_at IS NULL
          AND e.expense_date >= ${fromDate}
          AND e.expense_date <= ${toDate}
          AND NOT EXISTS (
            SELECT 1
            FROM ap_po_matches m
            INNER JOIN ap_bills b
              ON b.id = m.ap_bill_id
              AND b.organization_id = m.organization_id
            WHERE m.organization_id = ${organizationId}
              AND m.expense_id = e.id
              AND m.status = 'accepted'
              AND b.status IN ('open', 'partially_matched', 'matched')
              AND b.archived_at IS NULL
          )

        UNION ALL

        -- 2. Recognized AP vendor bills — billDate used for period recognition
        --    (billDate = recognition date; dueDate = cash payment date, not used here).
        SELECT b.net_amount::numeric AS amount
        FROM ap_bills b
        WHERE b.organization_id = ${organizationId}
          AND b.currency = ${currency}
          AND b.status IN ('open', 'partially_matched', 'matched')
          AND b.archived_at IS NULL
          AND b.bill_date IS NOT NULL
          AND b.bill_date >= ${fromDate}
          AND b.bill_date <= ${toDate}

        UNION ALL

        -- 3. Employee monthly labor costs whose yearMonth overlaps the date range.
        --    knownAmount is the best-available figure (actual when closed, estimated otherwise).
        SELECT emc.known_amount::numeric AS amount
        FROM employee_month_costs emc
        WHERE emc.organization_id = ${organizationId}
          AND emc.currency = ${currency}
          AND emc.status IN ('draft', 'applied', 'closed')
          AND emc.year_month >= to_char(${fromDate}::date, 'YYYY-MM')
          AND emc.year_month <= to_char(${toDate}::date, 'YYYY-MM')
      ) s
    `),
  );

  return fromNumericString(row?.total ?? '0', currency) ?? zeroMoney(currency);
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

/**
 * Same contribution rules as {@link sumUnallocatedExpensesForMonth}, grouped by year-month.
 * One query for a candidate-month set — not per-month N+1.
 */
export async function sumUnallocatedExpensesGroupedByYearMonth(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  yearMonths: readonly string[],
): Promise<Map<string, MoneyValue>> {
  const result = new Map<string, MoneyValue>();
  if (yearMonths.length === 0) return result;
  const rows = sqlRows<{ yearMonth: string; total: string }>(
    await db.execute(sql`
      select s.ym as "yearMonth", coalesce(sum(s.contrib), 0)::text as total
      from (
        select
          l.year_month as ym,
          l.amount as contrib
        from expense_managerial_schedule_lines l
        inner join expenses e
          on e.id = l.expense_id
          and e.organization_id = l.organization_id
        where l.organization_id = ${organizationId}
          and l.year_month in (${sql.join(yearMonths.map((ym) => sql`${ym}`), sql`, `)})
          and l.status in ('scheduled', 'recognized')
          and e.currency = ${currency}
          and e.status = 'finalized'
          and e.archived_at is null
          and coalesce(e.inventory_stock_purchase, false) = false
          and e.project_id is null
          and e.installment_count > 1
          and not exists (
            select 1 from expense_allocations a
            where a.expense_id = e.id
              and a.organization_id = e.organization_id
              and a.project_id is not null
          )
        union all
        select
          to_char(e.expense_date::date, 'YYYY-MM') as ym,
          e.net_amount as contrib
        from expenses e
        where e.organization_id = ${organizationId}
          and e.currency = ${currency}
          and e.status = 'finalized'
          and e.archived_at is null
          and coalesce(e.inventory_stock_purchase, false) = false
          and e.project_id is null
          and to_char(e.expense_date::date, 'YYYY-MM') in (${sql.join(yearMonths.map((ym) => sql`${ym}`), sql`, `)})
          and not (
            e.installment_count > 1 and exists (
              select 1
              from expense_managerial_schedule_lines l
              where l.expense_id = e.id
                and l.organization_id = e.organization_id
                and l.status in ('scheduled', 'recognized')
            )
          )
          and not exists (
            select 1 from expense_allocations a
            where a.expense_id = e.id
              and a.organization_id = e.organization_id
              and a.project_id is not null
          )
      ) s
      group by s.ym
    `),
  );
  for (const row of rows) {
    result.set(row.yearMonth, fromNumericString(row.total, currency) ?? zeroMoney(currency));
  }
  return result;
}

export interface UnallocatedExpenseMonthContribution {
  readonly expenseId: string;
  readonly expenseDate: string;
  readonly description: string | null;
  readonly recurringSourceTitle: string | null;
  readonly supplierName: string | null;
  readonly grossAmount: string;
  readonly netContribution: string;
  readonly costFamily: string;
  readonly costCategoryKey: string | null;
  readonly allocationDriverMethod: string | null;
  readonly categoryDefaultAllocationMethod: string | null;
  readonly yearMonth: string;
}

/** Per-expense contributions to a month's expense_unallocated general pool. */
export async function listUnallocatedExpenseContributionsForMonth(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  yearMonth: string,
): Promise<readonly UnallocatedExpenseMonthContribution[]> {
  return sqlRows<UnallocatedExpenseMonthContribution>(
    await db.execute(sql`
      select
        e.id as "expenseId",
        e.expense_date as "expenseDate",
        e.description,
        rd.title as "recurringSourceTitle",
        e.supplier_name as "supplierName",
        e.gross_amount::text as "grossAmount",
        s.contrib::text as "netContribution",
        e.cost_family as "costFamily",
        cc.key as "costCategoryKey",
        e.allocation_driver_method as "allocationDriverMethod",
        cc.default_allocation_method as "categoryDefaultAllocationMethod",
        ${yearMonth}::text as "yearMonth"
      from (
        select
          e.id,
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
      inner join expenses e on e.id = s.id and e.organization_id = ${organizationId}
      left join cost_categories cc
        on cc.id = e.cost_category_id and cc.organization_id = e.organization_id
      left join recurring_financial_draft_runs rr
        on rr.generated_entity_id = e.id
        and rr.generated_entity_type = 'expense'
        and rr.organization_id = ${organizationId}
      left join recurring_financial_drafts rd
        on rd.id = rr.draft_id and rd.organization_id = ${organizationId}
      where s.contrib <> 0
      order by e.expense_date desc, e.created_at desc
    `),
  );
}

/** Per-expense contributions across many months — one query, not per-month N+1. */
export async function listUnallocatedExpenseContributionsForYearMonths(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  yearMonths: readonly string[],
): Promise<readonly UnallocatedExpenseMonthContribution[]> {
  if (yearMonths.length === 0) return [];
  return sqlRows<UnallocatedExpenseMonthContribution>(
    await db.execute(sql`
      select
        e.id as "expenseId",
        e.expense_date as "expenseDate",
        e.description,
        rd.title as "recurringSourceTitle",
        e.supplier_name as "supplierName",
        e.gross_amount::text as "grossAmount",
        s.contrib::text as "netContribution",
        e.cost_family as "costFamily",
        cc.key as "costCategoryKey",
        e.allocation_driver_method as "allocationDriverMethod",
        cc.default_allocation_method as "categoryDefaultAllocationMethod",
        s.ym as "yearMonth"
      from (
        select
          e.id,
          l.year_month as ym,
          l.amount as contrib
        from expense_managerial_schedule_lines l
        inner join expenses e
          on e.id = l.expense_id
          and e.organization_id = l.organization_id
        where l.organization_id = ${organizationId}
          and l.year_month in (${sql.join(yearMonths.map((ym) => sql`${ym}`), sql`, `)})
          and l.status in ('scheduled', 'recognized')
          and e.currency = ${currency}
          and e.status = 'finalized'
          and e.archived_at is null
          and coalesce(e.inventory_stock_purchase, false) = false
          and e.project_id is null
          and e.installment_count > 1
          and l.amount <> 0
          and not exists (
            select 1 from expense_allocations a
            where a.expense_id = e.id
              and a.organization_id = e.organization_id
              and a.project_id is not null
          )
        union all
        select
          e.id,
          to_char(e.expense_date::date, 'YYYY-MM') as ym,
          e.net_amount as contrib
        from expenses e
        where e.organization_id = ${organizationId}
          and e.currency = ${currency}
          and e.status = 'finalized'
          and e.archived_at is null
          and coalesce(e.inventory_stock_purchase, false) = false
          and e.project_id is null
          and to_char(e.expense_date::date, 'YYYY-MM') in (${sql.join(yearMonths.map((ym) => sql`${ym}`), sql`, `)})
          and e.net_amount <> 0
          and not (
            e.installment_count > 1 and exists (
              select 1
              from expense_managerial_schedule_lines l
              where l.expense_id = e.id
                and l.organization_id = e.organization_id
                and l.status in ('scheduled', 'recognized')
            )
          )
          and not exists (
            select 1 from expense_allocations a
            where a.expense_id = e.id
              and a.organization_id = e.organization_id
              and a.project_id is not null
          )
      ) s
      inner join expenses e on e.id = s.id and e.organization_id = ${organizationId}
      left join cost_categories cc
        on cc.id = e.cost_category_id and cc.organization_id = e.organization_id
      left join recurring_financial_draft_runs rr
        on rr.generated_entity_id = e.id
        and rr.generated_entity_type = 'expense'
        and rr.organization_id = ${organizationId}
      left join recurring_financial_drafts rd
        on rd.id = rr.draft_id and rd.organization_id = ${organizationId}
      order by s.ym, e.expense_date desc, e.created_at desc
    `),
  );
}

export interface UnallocatedBusinessExpenseRow {
  readonly id: string;
  readonly expenseDate: string;
  readonly description: string | null;
  readonly supplierName: string | null;
  readonly vendorName: string | null;
  readonly netAmount: string;
  readonly currency: string;
}

/** Finalized shared expenses with no project allocation (company pool attribution pending). */
export async function listUnallocatedBusinessExpenses(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  limit = 5,
): Promise<{ readonly items: readonly UnallocatedBusinessExpenseRow[]; readonly totalCount: number }> {
  const baseConditions = sql`
    e.organization_id = ${organizationId}
    and e.currency = ${currency}
    and e.status = 'finalized'
    and e.archived_at is null
    and coalesce(e.inventory_stock_purchase, false) = false
    and e.project_id is null
    and e.cost_family = 'shared'
    and e.voids_expense_id is null
    and e.adjusts_expense_id is null
    and not exists (
      select 1 from expenses rev
      where rev.voids_expense_id = e.id
        and rev.organization_id = e.organization_id
        and rev.status = 'finalized'
        and rev.archived_at is null
    )
    and not exists (
      select 1 from expense_allocations a
      where a.expense_id = e.id
        and a.organization_id = e.organization_id
        and a.project_id is not null
    )
  `;

  const countRow = sqlFirstRow<{ count: number }>(
    await db.execute(sql`
      select count(*)::int as count
      from expenses e
      where ${baseConditions}
    `),
  );

  const items = sqlRows<UnallocatedBusinessExpenseRow>(
    await db.execute(sql`
      select
        e.id,
        e.expense_date as "expenseDate",
        e.description,
        e.supplier_name as "supplierName",
        v.name as "vendorName",
        e.net_amount::text as "netAmount",
        e.currency
      from expenses e
      left join vendors v on v.id = e.vendor_id
      where ${baseConditions}
      order by e.expense_date desc, e.created_at desc
      limit ${limit}
    `),
  );

  return {
    items,
    totalCount: countRow?.count ?? 0,
  };
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

import { and, eq, gte, inArray, isNotNull, isNull, lte, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  costCategories,
  employeeMonthCosts,
  employees,
  expenseAllocations,
  expenses,
  organizations,
  apBills,
  projects,
  vendors,
} from '@drizzle/schema';
import { currentYearMonth, yearMonthFromBusinessDate } from '@/modules/month-close';
import { businessDate, type BusinessDate } from '@/shared/dates';
import {
  addMoney,
  divideMoney,
  fromNumericString,
  isPositiveMoney,
  isZeroMoney,
  multiplyMoney,
  subtractMoney,
  roundMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { DbExecutor } from '@/shared/db/types';
import type { DbCostFamily, ProjectExpenseContribution } from '../domain/cost-aggregation';
import { isAllocationIntentSchemaReady } from './allocation-intent-schema';
import { isInternalEmployeePayrollCategoryKey } from '../domain/labor-expense-integrity';
import {
  recognizedExpenseGrossInYearMonth,
  recognizedExpenseNetInYearMonth,
  recognizedExpenseNetThroughYearMonth,
  type ExpensePaymentRecognitionFields,
} from '@/modules/expenses/domain/installment-payment-recognition';
import {
  loadInstallmentPaymentStateByExpenseIds,
  loadVerifiedInstallmentPaymentsByExpenseIds,
} from '@/modules/expenses';
import { sqlFirstRow, sqlRows } from './sql-rows';
import {
  recognitionDateForExpenseInYearMonth,
  vatFromNetGross,
  zeroVat,
} from '../domain/recognized-cost-breakdown';

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

/** Direct Actual expense contributions for one calendar month (GCM weight basis). */
export async function loadExpenseContributionsForProjectsInMonth(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
  yearMonth: string,
): Promise<ProjectExpenseContribution[]> {
  if (projectIds.length === 0) return [];
  return loadExpenseContributions(db, organizationId, { projectIds, yearMonth });
}

/**
 * Project Actual expense contributions.
 *
 * Installment expenses (`installment_count` > 1): NET recognized from payments made
 * (owner policy), not managerial schedule spread. Single-payment rows keep purchase-month
 * NET unless partially paid (then paid-month proportional NET).
 *
 * Excludes `inventory_stock_purchase` — those book to inventory cost layers (stock
 * state), not operating Actual. Project material Actual comes from consumptions.
 */
async function loadExpenseContributions(
  db: DbExecutor,
  organizationId: string,
  scope: {
    readonly projectId?: string;
    readonly projectIds?: readonly string[];
    /** When set, only that month's recognized expense amounts (not cumulative). */
    readonly yearMonth?: string;
  },
): Promise<ProjectExpenseContribution[]> {
  const { yearMonth } = scope;
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
      expenseDate: expenses.expenseDate,
      /** Cost code for budget-line mapping (0141). */
      costCodeId: expenses.costCodeId,
      /** Pre-computed base-currency equivalent for FX expenses (0141). */
      ilsEquivalentNetAmount: expenses.ilsEquivalentNetAmount,
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
      /** Line-level cost code; fallback to header (0141). */
      allocationLineCostCodeId: expenseAllocations.costCodeId,
      parentCostCodeId: expenses.costCodeId,
      parentExpenseDate: expenses.expenseDate,
    })
    .from(expenseAllocations)
    .innerJoin(expenses, eq(expenses.id, expenseAllocations.expenseId))
    .leftJoin(vendors, eq(vendors.id, expenses.vendorId))
    .leftJoin(costCategories, eq(costCategories.id, expenses.costCategoryId))
    .leftJoin(lineCategories, eq(lineCategories.id, expenseAllocations.costCategoryId))
    .where(and(...allocationFilters));

  const allExpenseIds = [
    ...new Set([...directRows, ...allocationRows].map((row) => row.expenseId)),
  ];
  const installmentExpenseIds = [
    ...new Set(
      [...directRows, ...allocationRows]
        .filter((row) => row.installmentCount > 1)
        .map((row) => row.expenseId),
    ),
  ];
  const installmentRecognition = yearMonth
    ? null
    : await loadInstallmentRecognitionByExpense(db, organizationId, installmentExpenseIds);
  const monthInstallmentByExpense = yearMonth
    ? await loadInstallmentAmountByExpenseForMonth(
        db,
        organizationId,
        allExpenseIds,
        yearMonth,
      )
    : null;

  const contributions: ProjectExpenseContribution[] = [];

  const expenseIdsWithProjectAllocation = new Set(
    allocationRows
      .filter((row) => row.projectId)
      .map((row) => `${row.expenseId}:${row.projectId}`),
  );

  for (const row of directRows) {
    if (
      row.projectId &&
      expenseIdsWithProjectAllocation.has(`${row.expenseId}:${row.projectId}`)
    ) {
      continue;
    }
    const amount = yearMonth
      ? resolveExpenseContributionAmountForMonth({
          fullAmount: row.netAmount,
          currency: row.currency,
          installmentCount: row.installmentCount,
          parentNet: row.netAmount,
          expenseDate: row.expenseDate,
          yearMonth,
          monthInstallment: monthInstallmentByExpense?.get(row.expenseId),
        })
      : contributionAmountWithInstallments(
          row.netAmount,
          row.currency,
          row.installmentCount,
          row.netAmount,
          installmentRecognition?.get(row.expenseId),
        );
    if (yearMonth && amount == null) continue;
    contributions.push({
      // Profitability uses NET - VAT must not inflate Actual Cost / margin.
      // Multi-month managerial schedules contribute recognized-to-date, not future lines.
      amount: amount ?? row.netAmount,
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
      // FX + cost-code (0141)
      costCodeId: row.costCodeId ?? null,
      ilsEquivalentNetAmount: row.ilsEquivalentNetAmount ?? null,
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
    const amount = yearMonth
      ? resolveExpenseContributionAmountForMonth({
          fullAmount: allocatedNet,
          currency: row.currency,
          installmentCount: row.installmentCount,
          parentNet: row.parentNetAmount,
          expenseDate: row.parentExpenseDate,
          yearMonth,
          monthInstallment: monthInstallmentByExpense?.get(row.expenseId),
        })
      : contributionAmountWithInstallments(
          allocatedNet,
          row.currency,
          row.installmentCount,
          row.parentNetAmount,
          installmentRecognition?.get(row.expenseId),
        );
    if (yearMonth && amount == null) continue;
    contributions.push({
      amount: amount ?? allocatedNet,
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
      // Line-level cost code overrides header; FX equivalent is not propagated to
      // allocation slices (no reliable proportional ILS split without rate per slice).
      costCodeId: row.allocationLineCostCodeId ?? row.parentCostCodeId ?? null,
      ilsEquivalentNetAmount: null,
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

/** @deprecated Use sumOrganizationRecognizedCostsInDateRange — expenses-only legacy path blocked (FIN2-009). */
export async function sumOrganizationCostsInDateRange(
  _db: DbExecutor,
  _organizationId: string,
  _currency: string,
  _fromDate: BusinessDate,
  _toDate: BusinessDate,
): Promise<MoneyValue> {
  throw new Error(
    'sumOrganizationCostsInDateRange is deprecated — use sumOrganizationRecognizedCostsInDateRange',
  );
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
  const pair = await sumOrganizationRecognizedCostPairInDateRange(
    db,
    organizationId,
    currency,
    fromDate,
    toDate,
  );
  return pair.net;
}

/**
 * Same recognition set as `sumOrganizationRecognizedCostsInDateRange`.
 * NET and GROSS are summed from the stored amounts. Labor has no VAT, so its
 * NET and GROSS are the same stored figure.
 */
async function sumFinalizedExpenseRecognizedPairForDateRange(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  fromDate: BusinessDate,
  toDate: BusinessDate,
): Promise<{ readonly net: MoneyValue; readonly gross: MoneyValue }> {
  const rows = await db
    .select({
      id: expenses.id,
      netAmount: expenses.netAmount,
      grossAmount: expenses.grossAmount,
      taxAmount: expenses.taxAmount,
      currency: expenses.currency,
      expenseDate: expenses.expenseDate,
      installmentCount: expenses.installmentCount,
      installmentStartDate: expenses.installmentStartDate,
      installmentsPaidCount: expenses.installmentsPaidCount,
      paidGrossAmount: expenses.paidGrossAmount,
      paidAt: expenses.paidAt,
      cashInstallmentSchedule: expenses.cashInstallmentSchedule,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, organizationId),
        eq(expenses.currency, currency),
        eq(expenses.status, 'finalized'),
        isNull(expenses.archivedAt),
        sql`NOT EXISTS (
          SELECT 1 FROM ap_po_matches m
          INNER JOIN ap_bills b ON b.id = m.ap_bill_id AND b.organization_id = m.organization_id
          WHERE m.organization_id = ${organizationId}
            AND m.expense_id = ${expenses.id}
            AND m.status = 'accepted'
            AND b.status IN ('open', 'partially_matched', 'matched')
            AND b.archived_at IS NULL
        )`,
      ),
    );

  const fieldsById = await loadExpensePaymentRecognitionFields(
    db,
    organizationId,
    rows.map((row) => row.id),
  );

  const fromYm = yearMonthFromBusinessDate(fromDate);
  const toYm = yearMonthFromBusinessDate(toDate);
  let net = zeroMoney(currency);
  let gross = zeroMoney(currency);
  for (let y = Number(fromYm.slice(0, 4)), m = Number(fromYm.slice(5, 7)); ; ) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    for (const row of rows) {
      const fields = fieldsById.get(row.id);
      if (!fields) continue;
      const netSlice = recognizedExpenseNetInYearMonth(fields, ym);
      const grossSlice = recognizedExpenseGrossInYearMonth(fields, ym);
      if (netSlice) net = addMoney(net, netSlice);
      if (grossSlice) gross = addMoney(gross, grossSlice);
    }
    if (ym === toYm) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return { net: roundMoney(net), gross: roundMoney(gross) };
}

export async function sumOrganizationRecognizedCostPairInDateRange(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  fromDate: BusinessDate,
  toDate: BusinessDate,
): Promise<{ readonly net: MoneyValue; readonly gross: MoneyValue }> {
  const expensePair = await sumFinalizedExpenseRecognizedPairForDateRange(
    db,
    organizationId,
    currency,
    fromDate,
    toDate,
  );
  const row = sqlFirstRow<{ net: string; gross: string }>(
    await db.execute(sql`
      SELECT
        coalesce(sum(s.net_amount), 0)::text AS net,
        coalesce(sum(s.gross_amount), 0)::text AS gross
      FROM (
        SELECT b.net_amount::numeric AS net_amount, b.gross_amount::numeric AS gross_amount
        FROM ap_bills b
        WHERE b.organization_id = ${organizationId}
          AND b.currency = ${currency}
          AND b.status IN ('open', 'partially_matched', 'matched')
          AND b.archived_at IS NULL
          AND b.bill_date IS NOT NULL
          AND b.bill_date >= ${fromDate}
          AND b.bill_date <= ${toDate}

        UNION ALL

        SELECT emc.known_amount::numeric AS net_amount, emc.known_amount::numeric AS gross_amount
        FROM employee_month_costs emc
        WHERE emc.organization_id = ${organizationId}
          AND emc.currency = ${currency}
          AND emc.status IN ('draft', 'applied', 'closed')
          AND emc.year_month >= to_char(${fromDate}::date, 'YYYY-MM')
          AND emc.year_month <= to_char(${toDate}::date, 'YYYY-MM')
      ) s
    `),
  );

  const apLaborNet = fromNumericString(row?.net ?? '0', currency) ?? zeroMoney(currency);
  const apLaborGross = fromNumericString(row?.gross ?? '0', currency) ?? zeroMoney(currency);

  return {
    net: roundMoney(addMoney(expensePair.net, apLaborNet)),
    gross: roundMoney(addMoney(expensePair.gross, apLaborGross)),
  };
}

export type RecognizedCostBreakdownSourceKind = 'expense' | 'ap_bill' | 'employer_cost';

export interface RecognizedCostBreakdownLine {
  readonly id: string;
  readonly sourceKind: RecognizedCostBreakdownSourceKind;
  readonly recognitionDate: BusinessDate;
  readonly yearMonth: string;
  readonly description: string;
  readonly party: string;
  readonly projectName: string | null;
  readonly costFamily: DbCostFamily | null;
  readonly installmentCount: number;
  readonly net: MoneyValue;
  readonly gross: MoneyValue;
  readonly vat: MoneyValue;
  readonly href: string;
}

/** Line-level breakdown using the same recognition rules as `sumOrganizationRecognizedCostPairInDateRange`. */
export async function listOrganizationRecognizedCostBreakdownInDateRange(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  fromDate: BusinessDate,
  toDate: BusinessDate,
): Promise<readonly RecognizedCostBreakdownLine[]> {
  const expenseRows = await db
    .select({
      id: expenses.id,
      supplierName: expenses.supplierName,
      description: expenses.description,
      costFamily: expenses.costFamily,
      projectId: expenses.projectId,
      projectName: projects.name,
      netAmount: expenses.netAmount,
      grossAmount: expenses.grossAmount,
      taxAmount: expenses.taxAmount,
      currency: expenses.currency,
      expenseDate: expenses.expenseDate,
      installmentCount: expenses.installmentCount,
      installmentStartDate: expenses.installmentStartDate,
      installmentsPaidCount: expenses.installmentsPaidCount,
      paidGrossAmount: expenses.paidGrossAmount,
      paidAt: expenses.paidAt,
      cashInstallmentSchedule: expenses.cashInstallmentSchedule,
    })
    .from(expenses)
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .where(
      and(
        eq(expenses.organizationId, organizationId),
        eq(expenses.currency, currency),
        eq(expenses.status, 'finalized'),
        isNull(expenses.archivedAt),
        sql`NOT EXISTS (
          SELECT 1 FROM ap_po_matches m
          INNER JOIN ap_bills b ON b.id = m.ap_bill_id AND b.organization_id = m.organization_id
          WHERE m.organization_id = ${organizationId}
            AND m.expense_id = ${expenses.id}
            AND m.status = 'accepted'
            AND b.status IN ('open', 'partially_matched', 'matched')
            AND b.archived_at IS NULL
        )`,
      ),
    );

  const fieldsById = await loadExpensePaymentRecognitionFields(
    db,
    organizationId,
    expenseRows.map((row) => row.id),
  );

  const lines: RecognizedCostBreakdownLine[] = [];
  const fromYm = yearMonthFromBusinessDate(fromDate);
  const toYm = yearMonthFromBusinessDate(toDate);

  for (let y = Number(fromYm.slice(0, 4)), m = Number(fromYm.slice(5, 7)); ; ) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    for (const row of expenseRows) {
      const fields = fieldsById.get(row.id);
      if (!fields) continue;
      const netSlice = recognizedExpenseNetInYearMonth(fields, ym);
      const grossSlice = recognizedExpenseGrossInYearMonth(fields, ym);
      if (!netSlice && !grossSlice) continue;
      const net = netSlice ?? zeroMoney(currency);
      const gross = grossSlice ?? net;
      const vat = isZeroMoney(subtractMoney(gross, net)) ? zeroVat(currency) : vatFromNetGross(net, gross);
      const recognitionDate =
        recognitionDateForExpenseInYearMonth(fields, ym) ?? (`${ym}-01` as BusinessDate);
      const party = row.supplierName?.trim() || row.description?.trim() || '';
      lines.push({
        id: `expense:${row.id}:${ym}`,
        sourceKind: 'expense',
        recognitionDate,
        yearMonth: ym,
        description: row.description?.trim() || '',
        party,
        projectName: row.projectName?.trim() || null,
        costFamily: row.costFamily ?? null,
        installmentCount: row.installmentCount,
        net: roundMoney(net),
        gross: roundMoney(gross),
        vat: roundMoney(vat),
        href: `/expenses/${row.id}`,
      });
    }
    if (ym === toYm) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  const apRows = await db
    .select({
      id: apBills.id,
      reference: apBills.reference,
      billDate: apBills.billDate,
      netAmount: apBills.netAmount,
      grossAmount: apBills.grossAmount,
      taxAmount: apBills.taxAmount,
      vendorName: vendors.name,
      projectName: projects.name,
    })
    .from(apBills)
    .leftJoin(vendors, eq(vendors.id, apBills.vendorId))
    .leftJoin(projects, eq(projects.id, apBills.projectId))
    .where(
      and(
        eq(apBills.organizationId, organizationId),
        eq(apBills.currency, currency),
        isNull(apBills.archivedAt),
        inArray(apBills.status, ['open', 'partially_matched', 'matched']),
        isNotNull(apBills.billDate),
        gte(apBills.billDate, fromDate),
        lte(apBills.billDate, toDate),
      ),
    );

  for (const bill of apRows) {
    if (!bill.billDate) continue;
    const net = fromNumericString(bill.netAmount, currency) ?? zeroMoney(currency);
    const gross = fromNumericString(bill.grossAmount, currency) ?? net;
    const vat =
      fromNumericString(bill.taxAmount ?? '0', currency) ??
      vatFromNetGross(net, gross);
    const ym = yearMonthFromBusinessDate(businessDate(bill.billDate));
    lines.push({
      id: `ap:${bill.id}`,
      sourceKind: 'ap_bill',
      recognitionDate: businessDate(bill.billDate),
      yearMonth: ym,
      description: bill.reference?.trim() || '',
      party: bill.vendorName?.trim() || '',
      projectName: bill.projectName?.trim() || null,
      costFamily: null,
      installmentCount: 1,
      net: roundMoney(net),
      gross: roundMoney(gross),
      vat: roundMoney(vat),
      href: `/procurement/ap?billId=${bill.id}`,
    });
  }

  const emcRows = await db
    .select({
      id: employeeMonthCosts.id,
      yearMonth: employeeMonthCosts.yearMonth,
      knownAmount: employeeMonthCosts.knownAmount,
      employeeName: employees.name,
    })
    .from(employeeMonthCosts)
    .innerJoin(employees, eq(employees.id, employeeMonthCosts.employeeId))
    .where(
      and(
        eq(employeeMonthCosts.organizationId, organizationId),
        eq(employeeMonthCosts.currency, currency),
        inArray(employeeMonthCosts.status, ['draft', 'applied', 'closed']),
        gte(employeeMonthCosts.yearMonth, fromYm),
        lte(employeeMonthCosts.yearMonth, toYm),
      ),
    );

  for (const row of emcRows) {
    const amount = fromNumericString(row.knownAmount, currency) ?? zeroMoney(currency);
    if (isZeroMoney(amount)) continue;
    lines.push({
      id: `emc:${row.id}`,
      sourceKind: 'employer_cost',
      recognitionDate: `${row.yearMonth}-01` as BusinessDate,
      yearMonth: row.yearMonth,
      description: row.yearMonth,
      party: row.employeeName?.trim() || '',
      projectName: null,
      costFamily: null,
      installmentCount: 1,
      net: roundMoney(amount),
      gross: roundMoney(amount),
      vat: zeroVat(currency),
      href: `/workforce/reports/monthly?month=${row.yearMonth}`,
    });
  }

  lines.sort((a, b) => {
    const dateCmp = a.recognitionDate.localeCompare(b.recognitionDate);
    if (dateCmp !== 0) return dateCmp;
    return a.id.localeCompare(b.id);
  });

  return lines;
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

function paymentRecognizedNetShareInMonth(
  fields: ExpensePaymentRecognitionFields,
  yearMonth: string,
  shareNetAmount: string,
): MoneyValue | null {
  const currency = fields.currency;
  const monthNet = recognizedExpenseNetInYearMonth(fields, yearMonth);
  if (!monthNet) return null;
  const parentNet = fromNumericString(fields.netAmount, currency);
  const share = fromNumericString(shareNetAmount, currency);
  if (!parentNet || !share || isZeroMoney(parentNet)) return null;
  if (share.amount === parentNet.amount) return monthNet;
  return roundMoney(divideMoney(multiplyMoney(monthNet, share.amount), parentNet.amount));
}

function sqlNoProjectExpenseAllocations(): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM expense_allocations a
    WHERE a.expense_id = ${expenses.id}
      AND a.organization_id = ${expenses.organizationId}
      AND a.project_id IS NOT NULL
  )`;
}

async function loadAutoPoolUnallocatedExpenseIds(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<readonly string[]> {
  const intentReady = await isAllocationIntentSchemaReady(db);
  const filters = [
    eq(expenses.organizationId, organizationId),
    eq(expenses.currency, currency),
    eq(expenses.status, 'finalized'),
    isNull(expenses.archivedAt),
    eq(expenses.inventoryStockPurchase, false),
    isNull(expenses.projectId),
    sqlNoProjectExpenseAllocations(),
  ];
  if (intentReady) {
    filters.push(eq(expenses.allocationIntent, 'auto_pool'));
  }
  const rows = await db.select({ id: expenses.id }).from(expenses).where(and(...filters));
  return rows.map((row) => row.id);
}

/** General-cost expense sources (unallocated pool + company-only) by payment-based NET. */
export async function loadGeneralCostExpenseSourceTotalsByMonths(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  yearMonths: readonly string[],
  options: { readonly includeUnallocated: boolean; readonly includeCompanyOnly: boolean },
): Promise<
  readonly { readonly yearMonth: string; readonly sourceKind: string; readonly total: string }[]
> {
  if (yearMonths.length === 0) return [];
  const intentReady = await isAllocationIntentSchemaReady(db);
  const unallocatedByMonth = new Map<string, MoneyValue>();
  const companyOnlyByMonth = new Map<string, MoneyValue>();
  for (const ym of yearMonths) {
    unallocatedByMonth.set(ym, zeroMoney(currency));
    companyOnlyByMonth.set(ym, zeroMoney(currency));
  }

  if (options.includeUnallocated) {
    const ids = await loadAutoPoolUnallocatedExpenseIds(db, organizationId, currency);
    const fieldsById = await loadExpensePaymentRecognitionFields(db, organizationId, ids);
    for (const fields of fieldsById.values()) {
      for (const ym of yearMonths) {
        const slice = recognizedExpenseNetInYearMonth(fields, ym);
        if (!slice) continue;
        unallocatedByMonth.set(ym, addMoney(unallocatedByMonth.get(ym) ?? zeroMoney(currency), slice));
      }
    }

    if (intentReady) {
      const partialRows = await db
        .select({
          expenseId: expenses.id,
          netAmount: expenses.netAmount,
          projectAllocated: sql<string>`coalesce((
            select sum(a.amount)
            from expense_allocations a
            where a.expense_id = ${expenses.id}
              and a.organization_id = ${expenses.organizationId}
              and a.project_id is not null
          ), 0)::text`.as('projectAllocated'),
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.organizationId, organizationId),
            eq(expenses.currency, currency),
            eq(expenses.status, 'finalized'),
            isNull(expenses.archivedAt),
            eq(expenses.inventoryStockPurchase, false),
            isNull(expenses.projectId),
            eq(expenses.allocationIntent, 'auto_pool'),
            sql`EXISTS (
              SELECT 1 FROM expense_allocations a
              WHERE a.expense_id = ${expenses.id}
                AND a.organization_id = ${expenses.organizationId}
                AND a.project_id IS NOT NULL
            )`,
          ),
        );
      const partialIds = partialRows.map((row) => row.expenseId);
      const partialFields = await loadExpensePaymentRecognitionFields(
        db,
        organizationId,
        partialIds,
      );
      for (const row of partialRows) {
        const fields = partialFields.get(row.expenseId);
        if (!fields) continue;
        const parentNet = fromNumericString(row.netAmount, currency);
        const allocated = fromNumericString(row.projectAllocated, currency) ?? zeroMoney(currency);
        if (!parentNet) continue;
        const remainder = subtractMoney(parentNet, allocated);
        if (!isPositiveMoney(remainder)) continue;
        for (const ym of yearMonths) {
          const slice = paymentRecognizedNetShareInMonth(fields, ym, remainder.amount);
          if (!slice) continue;
          unallocatedByMonth.set(
            ym,
            addMoney(unallocatedByMonth.get(ym) ?? zeroMoney(currency), slice),
          );
        }
      }
    }
  }

  if (options.includeCompanyOnly && intentReady) {
    const companyRows = await db
      .select({
        expenseId: expenses.id,
        netAmount: expenses.netAmount,
        projectAllocated: sql<string>`coalesce((
          select sum(a.amount)
          from expense_allocations a
          where a.expense_id = ${expenses.id}
            and a.organization_id = ${expenses.organizationId}
            and a.project_id is not null
        ), 0)::text`.as('projectAllocated'),
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.organizationId, organizationId),
          eq(expenses.currency, currency),
          eq(expenses.status, 'finalized'),
          isNull(expenses.archivedAt),
          eq(expenses.inventoryStockPurchase, false),
          isNull(expenses.projectId),
          eq(expenses.allocationIntent, 'company_only'),
        ),
      );
    const companyIds = companyRows.map((row) => row.expenseId);
    const companyFields = await loadExpensePaymentRecognitionFields(db, organizationId, companyIds);
    for (const row of companyRows) {
      const fields = companyFields.get(row.expenseId);
      if (!fields) continue;
      const parentNet = fromNumericString(row.netAmount, currency);
      const allocated = fromNumericString(row.projectAllocated, currency) ?? zeroMoney(currency);
      if (!parentNet) continue;
      const share = subtractMoney(parentNet, allocated);
      if (!isPositiveMoney(share)) continue;
      for (const ym of yearMonths) {
        const slice = paymentRecognizedNetShareInMonth(fields, ym, share.amount);
        if (!slice) continue;
        companyOnlyByMonth.set(
          ym,
          addMoney(companyOnlyByMonth.get(ym) ?? zeroMoney(currency), slice),
        );
      }
    }

    const overheadRows = await db
      .select({
        expenseId: expenses.id,
        amount: expenseAllocations.amount,
      })
      .from(expenseAllocations)
      .innerJoin(expenses, eq(expenses.id, expenseAllocations.expenseId))
      .where(
        and(
          eq(expenseAllocations.organizationId, organizationId),
          eq(expenses.currency, currency),
          eq(expenses.status, 'finalized'),
          isNull(expenses.archivedAt),
          eq(expenses.inventoryStockPurchase, false),
          isNull(expenses.projectId),
          eq(expenses.allocationIntent, 'project_allocate'),
          eq(expenseAllocations.targetType, 'overhead'),
        ),
      );
    const overheadExpenseIds = [...new Set(overheadRows.map((row) => row.expenseId))];
    const overheadFields = await loadExpensePaymentRecognitionFields(
      db,
      organizationId,
      overheadExpenseIds,
    );
    for (const row of overheadRows) {
      const fields = overheadFields.get(row.expenseId);
      if (!fields) continue;
      for (const ym of yearMonths) {
        const slice = paymentRecognizedNetShareInMonth(fields, ym, row.amount);
        if (!slice) continue;
        companyOnlyByMonth.set(
          ym,
          addMoney(companyOnlyByMonth.get(ym) ?? zeroMoney(currency), slice),
        );
      }
    }
  }

  const out: { yearMonth: string; sourceKind: string; total: string }[] = [];
  for (const ym of yearMonths) {
    if (options.includeUnallocated) {
      out.push({
        yearMonth: ym,
        sourceKind: 'expense_unallocated',
        total: roundMoney(unallocatedByMonth.get(ym) ?? zeroMoney(currency)).amount,
      });
    }
    if (options.includeCompanyOnly && intentReady) {
      out.push({
        yearMonth: ym,
        sourceKind: 'expense_company_only',
        total: roundMoney(companyOnlyByMonth.get(ym) ?? zeroMoney(currency)).amount,
      });
    }
  }
  return out;
}

/**
 * Finalized expenses in a calendar month that do not touch a project
 * (no project_id and no expense_allocations lines) — monthly General Pool source.
 * Excludes inventory_stock_purchase (stock state, not operating Actual).
 *
 * Installment expenses: NET only in months when installments were paid (owner policy).
 */
export async function sumUnallocatedExpensesForMonth(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  yearMonth: string,
): Promise<MoneyValue> {
  const grouped = await sumUnallocatedExpensesGroupedByYearMonth(db, organizationId, currency, [
    yearMonth,
  ]);
  return grouped.get(yearMonth) ?? zeroMoney(currency);
}

/** Company-only general expenses — excluded from GCM auto-allocation and project Actual. */
export async function sumCompanyOnlyExpensesForMonth(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  yearMonth: string,
): Promise<MoneyValue> {
  if (!(await isAllocationIntentSchemaReady(db))) {
    return zeroMoney(currency);
  }
  const rows = await loadGeneralCostExpenseSourceTotalsByMonths(
    db,
    organizationId,
    currency,
    [yearMonth],
    { includeUnallocated: false, includeCompanyOnly: true },
  );
  const row = rows.find((r) => r.sourceKind === 'expense_company_only' && r.yearMonth === yearMonth);
  return fromNumericString(row?.total ?? '0', currency) ?? zeroMoney(currency);
}

/** Org-wide intentional company-only expense NET (excluded from awaiting-allocation metrics). */
export async function sumOrganizationCompanyOnlyExpenses(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<MoneyValue> {
  if (!(await isAllocationIntentSchemaReady(db))) {
    return zeroMoney(currency);
  }
  const row = sqlFirstRow<{ total: string }>(
    await db.execute(sql`
      select coalesce(sum(s.contrib), 0)::text as total
      from (
        select (
          e.net_amount - coalesce((
            select sum(a.amount)
            from expense_allocations a
            where a.expense_id = e.id
              and a.organization_id = e.organization_id
              and a.project_id is not null
          ), 0)
        ) as contrib
        from expenses e
        where e.organization_id = ${organizationId}
          and e.currency = ${currency}
          and e.status = 'finalized'
          and e.archived_at is null
          and coalesce(e.inventory_stock_purchase, false) = false
          and e.project_id is null
          and e.allocation_intent = 'company_only'
          and not (
            e.installment_count > 1 and exists (
              select 1 from expense_managerial_schedule_lines l
              where l.expense_id = e.id and l.organization_id = e.organization_id
                and l.status in ('scheduled', 'recognized')
            )
          )
        union all
        select a.amount as contrib
        from expense_allocations a
        inner join expenses e on e.id = a.expense_id and e.organization_id = a.organization_id
        where a.organization_id = ${organizationId}
          and e.currency = ${currency}
          and e.status = 'finalized'
          and e.archived_at is null
          and coalesce(e.inventory_stock_purchase, false) = false
          and e.project_id is null
          and e.allocation_intent = 'project_allocate'
          and a.target_type = 'overhead'
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
  for (const ym of yearMonths) {
    result.set(ym, zeroMoney(currency));
  }
  const rows = await loadGeneralCostExpenseSourceTotalsByMonths(
    db,
    organizationId,
    currency,
    yearMonths,
    { includeUnallocated: true, includeCompanyOnly: false },
  );
  for (const row of rows) {
    if (row.sourceKind !== 'expense_unallocated') continue;
    result.set(
      row.yearMonth,
      fromNumericString(row.total, currency) ?? zeroMoney(currency),
    );
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
  return listUnallocatedExpenseContributionsForYearMonths(
    db,
    organizationId,
    currency,
    [yearMonth],
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
  const ymSet = new Set(yearMonths);
  const intentReady = await isAllocationIntentSchemaReady(db);

  type ContribTarget = { readonly expenseId: string; readonly shareNet: string | null };
  const targets: ContribTarget[] = [];

  const fullUnallocatedIds = await loadAutoPoolUnallocatedExpenseIds(db, organizationId, currency);
  for (const id of fullUnallocatedIds) {
    targets.push({ expenseId: id, shareNet: null });
  }

  if (intentReady) {
    const partialRows = await db
      .select({
        expenseId: expenses.id,
        netAmount: expenses.netAmount,
        projectAllocated: sql<string>`coalesce((
          select sum(a.amount)
          from expense_allocations a
          where a.expense_id = ${expenses.id}
            and a.organization_id = ${expenses.organizationId}
            and a.project_id is not null
        ), 0)::text`.as('projectAllocated'),
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.organizationId, organizationId),
          eq(expenses.currency, currency),
          eq(expenses.status, 'finalized'),
          isNull(expenses.archivedAt),
          eq(expenses.inventoryStockPurchase, false),
          isNull(expenses.projectId),
          eq(expenses.allocationIntent, 'auto_pool'),
          sql`EXISTS (
            SELECT 1 FROM expense_allocations a
            WHERE a.expense_id = ${expenses.id}
              AND a.organization_id = ${expenses.organizationId}
              AND a.project_id IS NOT NULL
          )`,
        ),
      );
    for (const row of partialRows) {
      const parentNet = fromNumericString(row.netAmount, currency);
      const allocated = fromNumericString(row.projectAllocated, currency) ?? zeroMoney(currency);
      if (!parentNet) continue;
      const remainder = subtractMoney(parentNet, allocated);
      if (!isPositiveMoney(remainder)) continue;
      targets.push({ expenseId: row.expenseId, shareNet: remainder.amount });
    }
  }

  const expenseIds = [...new Set(targets.map((t) => t.expenseId))];
  if (expenseIds.length === 0) return [];

  const metaRows = sqlRows<{
    expenseId: string;
    expenseDate: string;
    description: string | null;
    recurringSourceTitle: string | null;
    supplierName: string | null;
    grossAmount: string;
    costFamily: string;
    costCategoryKey: string | null;
    allocationDriverMethod: string | null;
    categoryDefaultAllocationMethod: string | null;
    createdAt: string;
  }>(
    await db.execute(sql`
      select
        e.id as "expenseId",
        e.expense_date as "expenseDate",
        e.description,
        rd.title as "recurringSourceTitle",
        e.supplier_name as "supplierName",
        e.gross_amount::text as "grossAmount",
        e.cost_family as "costFamily",
        cc.key as "costCategoryKey",
        e.allocation_driver_method as "allocationDriverMethod",
        cc.default_allocation_method as "categoryDefaultAllocationMethod",
        e.created_at::text as "createdAt"
      from expenses e
      left join cost_categories cc
        on cc.id = e.cost_category_id and cc.organization_id = e.organization_id
      left join recurring_financial_draft_runs rr
        on rr.generated_entity_id = e.id
        and rr.generated_entity_type = 'expense'
        and rr.organization_id = ${organizationId}
      left join recurring_financial_drafts rd
        on rd.id = rr.draft_id and rd.organization_id = ${organizationId}
      where e.organization_id = ${organizationId}
        and e.id in (${sql.join(expenseIds.map((id) => sql`${id}`), sql`, `)})
    `),
  );
  const metaById = new Map(metaRows.map((row) => [row.expenseId, row]));
  const fieldsById = await loadExpensePaymentRecognitionFields(db, organizationId, expenseIds);

  const out: UnallocatedExpenseMonthContribution[] = [];
  for (const target of targets) {
    const meta = metaById.get(target.expenseId);
    const fields = fieldsById.get(target.expenseId);
    if (!meta || !fields) continue;
    for (const ym of yearMonths) {
      const slice = target.shareNet
        ? paymentRecognizedNetShareInMonth(fields, ym, target.shareNet)
        : recognizedExpenseNetInYearMonth(fields, ym);
      if (!slice || isZeroMoney(slice)) continue;
      out.push({
        expenseId: meta.expenseId,
        expenseDate: meta.expenseDate,
        description: meta.description,
        recurringSourceTitle: meta.recurringSourceTitle,
        supplierName: meta.supplierName,
        grossAmount: meta.grossAmount,
        netContribution: slice.amount,
        costFamily: meta.costFamily,
        costCategoryKey: meta.costCategoryKey,
        allocationDriverMethod: meta.allocationDriverMethod,
        categoryDefaultAllocationMethod: meta.categoryDefaultAllocationMethod,
        yearMonth: ym,
      });
    }
  }

  out.sort((a, b) => {
    const ymCmp = a.yearMonth.localeCompare(b.yearMonth);
    if (ymCmp !== 0) return ymCmp;
    const dateCmp = b.expenseDate.localeCompare(a.expenseDate);
    if (dateCmp !== 0) return dateCmp;
    const ma = metaById.get(a.expenseId);
    const mb = metaById.get(b.expenseId);
    return (mb?.createdAt ?? '').localeCompare(ma?.createdAt ?? '');
  });

  return out.filter((row) => ymSet.has(row.yearMonth));
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

/** Finalized shared expenses requiring Owner project allocation (actionable only). */
export async function listUnallocatedBusinessExpenses(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  limit = 5,
): Promise<{ readonly items: readonly UnallocatedBusinessExpenseRow[]; readonly totalCount: number }> {
  const { sqlExpenseRequiresProjectAllocationFilter } = await import(
    '@/modules/expenses/data/expense-allocation-actionable-sql'
  );
  const actionableFilter = await sqlExpenseRequiresProjectAllocationFilter(
    db,
    organizationId,
    'e',
  );
  const baseConditions = sql`
    ${actionableFilter}
    and e.currency = ${currency}
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

/** Sum NET of expenses that require Owner project allocation (dashboard attention predicate). */
export async function sumExpensesRequiringProjectAllocation(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<MoneyValue> {
  const { sqlExpenseRequiresProjectAllocationFilter } = await import(
    '@/modules/expenses/data/expense-allocation-actionable-sql'
  );
  const actionableFilter = await sqlExpenseRequiresProjectAllocationFilter(
    db,
    organizationId,
    'e',
  );
  const row = sqlFirstRow<{ total: string }>(
    await db.execute(sql`
      select coalesce(sum(e.net_amount), 0)::text as total
      from expenses e
      where ${actionableFilter}
        and e.currency = ${currency}
    `),
  );
  return fromNumericString(row?.total ?? '0', currency) ?? zeroMoney(currency);
}

interface InstallmentRecognition {
  readonly recognizedAmount: string;
  readonly hasActiveLines: boolean;
}

type MonthInstallmentSlice = {
  readonly hasActiveLines: true;
  readonly lineAmount: string;
};

async function loadExpensePaymentRecognitionFields(
  db: DbExecutor,
  organizationId: string,
  expenseIds: readonly string[],
): Promise<Map<string, ExpensePaymentRecognitionFields>> {
  const map = new Map<string, ExpensePaymentRecognitionFields>();
  if (expenseIds.length === 0) return map;
  const rows = await db
    .select({
      id: expenses.id,
      netAmount: expenses.netAmount,
      grossAmount: expenses.grossAmount,
      taxAmount: expenses.taxAmount,
      currency: expenses.currency,
      expenseDate: expenses.expenseDate,
      installmentCount: expenses.installmentCount,
      installmentStartDate: expenses.installmentStartDate,
      installmentsPaidCount: expenses.installmentsPaidCount,
      paidGrossAmount: expenses.paidGrossAmount,
      paidAt: expenses.paidAt,
      cashInstallmentSchedule: expenses.cashInstallmentSchedule,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, organizationId),
        inArray(expenses.id, [...expenseIds]),
        eq(expenses.status, 'finalized'),
        isNull(expenses.archivedAt),
      ),
    );
  const paymentFieldRows = rows.map((row) => ({
    id: row.id,
    grossAmount: row.grossAmount,
    currency: row.currency,
    installmentCount: row.installmentCount,
    installmentStartDate: row.installmentStartDate,
    expenseDate: row.expenseDate,
    cashInstallmentSchedule: row.cashInstallmentSchedule,
    installmentsPaidCount: row.installmentsPaidCount,
    paidGrossAmount: row.paidGrossAmount,
    paidAt: row.paidAt,
  }));
  const verifiedByExpense = await loadVerifiedInstallmentPaymentsByExpenseIds(
    db,
    organizationId,
    paymentFieldRows,
  );
  const stateByExpense = await loadInstallmentPaymentStateByExpenseIds(
    db,
    organizationId,
    paymentFieldRows,
  );
  for (const row of rows) {
    const paymentState = stateByExpense.get(row.id);
    map.set(row.id, {
      netAmount: row.netAmount,
      grossAmount: row.grossAmount,
      taxAmount: row.taxAmount,
      currency: row.currency,
      expenseDate: row.expenseDate,
      installmentCount: row.installmentCount,
      installmentStartDate: row.installmentStartDate,
      installmentsPaidCount: row.installmentsPaidCount,
      paidGrossAmount: row.paidGrossAmount,
      paidAt: row.paidAt,
      cashInstallmentSchedule: row.cashInstallmentSchedule,
      verifiedInstallmentPayments: verifiedByExpense.get(row.id),
      dateUnknownGross: paymentState?.dateUnknownGross.amount ?? null,
      installmentPaymentStatus: paymentState?.status,
    });
  }
  return map;
}

/** Payment-based NET recognized for one expense in one calendar month (owner policy). */
async function loadInstallmentAmountByExpenseForMonth(
  db: DbExecutor,
  organizationId: string,
  expenseIds: readonly string[],
  yearMonth: string,
): Promise<Map<string, MonthInstallmentSlice>> {
  const map = new Map<string, MonthInstallmentSlice>();
  const fieldsById = await loadExpensePaymentRecognitionFields(db, organizationId, expenseIds);
  for (const [expenseId, fields] of fieldsById) {
    const slice = recognizedExpenseNetInYearMonth(fields, yearMonth);
    if (!slice || isZeroMoney(slice)) continue;
    map.set(expenseId, { hasActiveLines: true, lineAmount: slice.amount });
  }
  return map;
}

function resolveExpenseContributionAmountForMonth(input: {
  readonly fullAmount: string;
  readonly currency: string;
  readonly installmentCount: number;
  readonly parentNet: string;
  readonly expenseDate: string;
  readonly yearMonth: string;
  readonly monthInstallment: MonthInstallmentSlice | InstallmentRecognition | undefined;
}): string | null {
  if (input.installmentCount > 1 && !input.monthInstallment?.hasActiveLines) {
    return null;
  }
  if (input.installmentCount > 1 && input.monthInstallment?.hasActiveLines) {
    const lineAmountRaw =
      'lineAmount' in input.monthInstallment
        ? input.monthInstallment.lineAmount
        : input.monthInstallment.recognizedAmount;
    const lineTotal = fromNumericString(lineAmountRaw, input.currency);
    if (!lineTotal || isZeroMoney(lineTotal)) return null;
    const parentNet = fromNumericString(input.parentNet, input.currency);
    const slice = fromNumericString(input.fullAmount, input.currency);
    if (!parentNet || !slice || isZeroMoney(parentNet)) return null;
    if (slice.amount === parentNet.amount) return lineTotal.amount;
    return roundMoney(divideMoney(multiplyMoney(lineTotal, slice.amount), parentNet.amount)).amount;
  }
  if (yearMonthFromBusinessDate(input.expenseDate) !== input.yearMonth) return null;
  return input.fullAmount;
}

/**
 * Installment expenses: cumulative NET recognized through org current month
 * based on payments actually made (not managerial schedule spread).
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

  const fieldsById = await loadExpensePaymentRecognitionFields(db, organizationId, expenseIds);
  for (const [expenseId, fields] of fieldsById) {
    if (fields.installmentCount <= 1) continue;
    const recognized = recognizedExpenseNetThroughYearMonth(fields, throughYearMonth);
    if (isZeroMoney(recognized)) continue;
    map.set(expenseId, { hasActiveLines: true, recognizedAmount: recognized.amount });
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

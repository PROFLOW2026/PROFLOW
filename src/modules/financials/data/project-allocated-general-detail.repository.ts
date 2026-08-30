import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import {
  generalCostMonthAllocations,
  generalCostMonthSources,
  generalCostMonths,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { listUnallocatedExpenseContributionsForYearMonths } from './expenses.repository';
import type { UnallocatedExpenseMonthContribution } from './expenses.repository';
import type { RawProjectAllocatedGeneralAttributionRow } from '../domain/project-allocated-general-detail';
import { resolveGeneralCostSourceLabelHebrew } from '../domain/allocation-method-labels';

export async function loadProjectAllocatedGeneralAttributionRows(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
  options?: { readonly throughYearMonth?: string },
): Promise<readonly RawProjectAllocatedGeneralAttributionRow[]> {
  const monthProjectCount = sql<number>`(
    SELECT count(*)::int
    FROM ${generalCostMonthAllocations} gca_count
    WHERE gca_count.general_cost_month_id = ${generalCostMonths.id}
      AND gca_count.organization_id = ${generalCostMonthAllocations.organizationId}
  )`.as('month_project_count');

  const monthRows = await db
    .select({
      generalCostMonthId: generalCostMonths.id,
      yearMonth: generalCostMonths.yearMonth,
      projectAllocatedAmount: generalCostMonthAllocations.amount,
      projectWeightPercent: generalCostMonthAllocations.weightPercent,
      poolAmount: generalCostMonths.poolAmount,
      basisMode: generalCostMonths.basisMode,
      monthProjectCount,
      currency: generalCostMonthAllocations.currency,
    })
    .from(generalCostMonthAllocations)
    .innerJoin(
      generalCostMonths,
      and(
        eq(generalCostMonthAllocations.generalCostMonthId, generalCostMonths.id),
        eq(generalCostMonthAllocations.organizationId, generalCostMonths.organizationId),
      ),
    )
    .where(
      and(
        eq(generalCostMonthAllocations.organizationId, organizationId),
        eq(generalCostMonthAllocations.projectId, projectId),
        sql`upper(${generalCostMonthAllocations.currency}) = upper(${currency})`,
        inArray(generalCostMonths.status, ['open', 'frozen']),
        ...(options?.throughYearMonth
          ? [sql`${generalCostMonths.yearMonth} <= ${options.throughYearMonth}`]
          : []),
      ),
    )
    .orderBy(generalCostMonths.yearMonth);

  if (monthRows.length === 0) return [];

  const yearMonths = [...new Set(monthRows.map((month) => month.yearMonth))];
  const monthIds = monthRows.map((month) => month.generalCostMonthId);

  const [expenseContributions, otherSources] = await Promise.all([
    listUnallocatedExpenseContributionsForYearMonths(
      db,
      organizationId,
      currency,
      yearMonths,
    ),
    db
      .select({
        generalCostMonthId: generalCostMonthSources.generalCostMonthId,
        sourceKind: generalCostMonthSources.sourceKind,
        sourceLabel: generalCostMonthSources.label,
        sourcePoolAmount: generalCostMonthSources.amount,
      })
      .from(generalCostMonthSources)
      .where(
        and(
          eq(generalCostMonthSources.organizationId, organizationId),
          inArray(generalCostMonthSources.generalCostMonthId, monthIds),
          ne(generalCostMonthSources.sourceKind, 'expense_unallocated'),
        ),
      ),
  ]);

  const expensesByMonth = new Map<string, UnallocatedExpenseMonthContribution[]>();
  for (const expense of expenseContributions) {
    const list = expensesByMonth.get(expense.yearMonth) ?? [];
    list.push(expense);
    expensesByMonth.set(expense.yearMonth, list);
  }
  const otherByMonthId = new Map<string, typeof otherSources>();
  for (const source of otherSources) {
    const list = otherByMonthId.get(source.generalCostMonthId) ?? [];
    list.push(source);
    otherByMonthId.set(source.generalCostMonthId, list);
  }

  const rawRows: RawProjectAllocatedGeneralAttributionRow[] = [];

  for (const month of monthRows) {
    for (const expense of expensesByMonth.get(month.yearMonth) ?? []) {
      rawRows.push({
        generalCostMonthId: month.generalCostMonthId,
        yearMonth: month.yearMonth,
        projectAllocatedAmount: month.projectAllocatedAmount,
        projectWeightPercent: month.projectWeightPercent,
        poolAmount: month.poolAmount,
        basisMode: month.basisMode,
        sourceKind: 'expense_unallocated',
        sourceId: expense.expenseId,
        sourceLabel: resolveGeneralCostSourceLabelHebrew('expense_unallocated'),
        sourcePoolAmount: expense.netContribution,
        expenseDate: expense.expenseDate,
        description: expense.description,
        recurringSourceTitle: expense.recurringSourceTitle,
        supplierName: expense.supplierName,
        expenseGrossAmount: expense.grossAmount,
        expenseCostFamily: expense.costFamily,
        costCategoryKey: expense.costCategoryKey,
        expenseAllocationDriverMethod: expense.allocationDriverMethod,
        categoryDefaultAllocationMethod: expense.categoryDefaultAllocationMethod,
        monthProjectCount: month.monthProjectCount,
        currency: month.currency,
      });
    }

    for (const source of otherByMonthId.get(month.generalCostMonthId) ?? []) {
      rawRows.push({
        generalCostMonthId: month.generalCostMonthId,
        yearMonth: month.yearMonth,
        projectAllocatedAmount: month.projectAllocatedAmount,
        projectWeightPercent: month.projectWeightPercent,
        poolAmount: month.poolAmount,
        basisMode: month.basisMode,
        sourceKind: source.sourceKind,
        sourceId: null,
        sourceLabel:
          resolveGeneralCostSourceLabelHebrew(source.sourceKind) ??
          source.sourceLabel ??
          source.sourceKind,
        sourcePoolAmount: source.sourcePoolAmount,
        expenseDate: null,
        description: null,
        recurringSourceTitle: null,
        supplierName: null,
        expenseGrossAmount: source.sourcePoolAmount,
        expenseCostFamily: null,
        costCategoryKey: null,
        expenseAllocationDriverMethod: null,
        categoryDefaultAllocationMethod: null,
        monthProjectCount: month.monthProjectCount,
        currency: month.currency,
      });
    }
  }

  return rawRows;
}

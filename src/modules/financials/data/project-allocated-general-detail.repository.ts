import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  expenses,
  generalCostMonthAllocations,
  generalCostMonthSources,
  generalCostMonths,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { RawProjectAllocatedGeneralAttributionRow } from '../domain/project-allocated-general-detail';

export async function loadProjectAllocatedGeneralAttributionRows(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<readonly RawProjectAllocatedGeneralAttributionRow[]> {
  const rows = await db
    .select({
      yearMonth: generalCostMonths.yearMonth,
      projectAllocatedAmount: generalCostMonthAllocations.amount,
      projectWeightPercent: generalCostMonthAllocations.weightPercent,
      poolAmount: generalCostMonths.poolAmount,
      basisMode: generalCostMonths.basisMode,
      sourceKind: generalCostMonthSources.sourceKind,
      sourceId: generalCostMonthSources.sourceId,
      sourceLabel: generalCostMonthSources.label,
      sourcePoolAmount: generalCostMonthSources.amount,
      expenseDate: expenses.expenseDate,
      description: expenses.description,
      supplierName: expenses.supplierName,
      expenseGrossAmount: expenses.grossAmount,
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
    .leftJoin(
      generalCostMonthSources,
      and(
        eq(generalCostMonthSources.generalCostMonthId, generalCostMonths.id),
        eq(generalCostMonthSources.organizationId, generalCostMonths.organizationId),
      ),
    )
    .leftJoin(
      expenses,
      and(
        eq(expenses.id, generalCostMonthSources.sourceId),
        eq(expenses.organizationId, generalCostMonthSources.organizationId),
        eq(generalCostMonthSources.sourceKind, 'expense_unallocated'),
      ),
    )
    .where(
      and(
        eq(generalCostMonthAllocations.organizationId, organizationId),
        eq(generalCostMonthAllocations.projectId, projectId),
        sql`upper(${generalCostMonthAllocations.currency}) = upper(${currency})`,
        inArray(generalCostMonths.status, ['open', 'frozen']),
      ),
    )
    .orderBy(generalCostMonths.yearMonth);

  return rows.map((row) => ({
    yearMonth: row.yearMonth,
    projectAllocatedAmount: row.projectAllocatedAmount,
    projectWeightPercent: row.projectWeightPercent,
    poolAmount: row.poolAmount,
    basisMode: row.basisMode,
    sourceKind: row.sourceKind,
    sourceId: row.sourceId,
    sourceLabel: row.sourceLabel,
    sourcePoolAmount: row.sourcePoolAmount,
    expenseDate: row.expenseDate,
    description: row.description,
    supplierName: row.supplierName,
    expenseGrossAmount: row.expenseGrossAmount,
    currency: row.currency,
  }));
}

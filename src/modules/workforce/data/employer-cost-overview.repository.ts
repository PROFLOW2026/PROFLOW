import { and, eq, inArray, sql } from 'drizzle-orm';
import { employeeMonthCosts, laborAllocationRunLines, laborAllocationRuns } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

const ACTIVE_MONTH_STATUSES = ['draft', 'applied', 'closed'] as const;

export interface EmployerMonthCostFacts {
  readonly estimatedAmount: string;
  readonly actualAmount: string;
  readonly monthFactCount: number;
  readonly currency: string;
}

/** Estimated and actual amounts on live employer-cost months. Superseded rows are excluded. */
export async function sumEmployeeMonthCostFacts(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<EmployerMonthCostFacts> {
  const [row] = await db
    .select({
      estimatedAmount: sql<string>`coalesce(sum(${employeeMonthCosts.estimatedAmount}), 0)::text`,
      actualAmount: sql<string>`coalesce(sum(${employeeMonthCosts.actualAmount}), 0)::text`,
      monthFactCount: sql<number>`count(*)::int`,
    })
    .from(employeeMonthCosts)
    .where(
      and(
        eq(employeeMonthCosts.organizationId, organizationId),
        inArray(employeeMonthCosts.status, [...ACTIVE_MONTH_STATUSES]),
        sql`upper(${employeeMonthCosts.currency}) = upper(${currency})`,
      ),
    );

  return {
    estimatedAmount: row?.estimatedAmount ?? '0',
    actualAmount: row?.actualAmount ?? '0',
    monthFactCount: row?.monthFactCount ?? 0,
    currency: currency.toUpperCase(),
  };
}

/** Sum of applied labor-allocation lines (project-attributed employer cost). */
export async function sumAppliedLaborAllocationToProjects(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<{ totalAmount: string; currency: string }> {
  const [row] = await db
    .select({
      totalAmount: sql<string>`coalesce(sum(${laborAllocationRunLines.amount}), 0)::text`,
    })
    .from(laborAllocationRunLines)
    .innerJoin(
      laborAllocationRuns,
      and(
        eq(laborAllocationRunLines.laborAllocationRunId, laborAllocationRuns.id),
        eq(laborAllocationRunLines.organizationId, laborAllocationRuns.organizationId),
      ),
    )
    .innerJoin(
      employeeMonthCosts,
      and(
        eq(laborAllocationRuns.employeeMonthCostId, employeeMonthCosts.id),
        eq(laborAllocationRuns.organizationId, employeeMonthCosts.organizationId),
      ),
    )
    .where(
      and(
        eq(laborAllocationRunLines.organizationId, organizationId),
        eq(laborAllocationRuns.status, 'applied'),
        inArray(employeeMonthCosts.status, ['applied', 'closed']),
        sql`upper(${laborAllocationRunLines.currency}) = upper(${currency})`,
      ),
    );

  return {
    totalAmount: row?.totalAmount ?? '0',
    currency: currency.toUpperCase(),
  };
}

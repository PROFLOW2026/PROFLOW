import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  employeeMonthCosts,
  laborAllocationRunLines,
  laborAllocationRuns,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { displacedEmployeeMonthKey } from '../domain/labor-recognition';

export interface MonthlyAllocatedLaborAggregate {
  readonly projectId: string;
  readonly totalAmount: string;
  readonly currency: string;
}

const appliedClosedStatuses = ['applied', 'closed'] as const;

function monthlyAllocatedJoinConditions(organizationId: string, currency: string) {
  return and(
    eq(laborAllocationRunLines.organizationId, organizationId),
    eq(laborAllocationRuns.organizationId, organizationId),
    eq(employeeMonthCosts.organizationId, organizationId),
    eq(laborAllocationRuns.status, 'applied'),
    inArray(employeeMonthCosts.status, [...appliedClosedStatuses]),
    eq(employeeMonthCosts.recognitionSource, 'monthly_allocated'),
    sql`upper(${laborAllocationRunLines.currency}) = upper(${currency})`,
  );
}

/**
 * Σ labor_allocation_run_lines for applied runs on applied/closed
 * monthly_allocated employee months, grouped by project.
 * Pass `null` for projectIds to include all projects in the org.
 */
export async function sumMonthlyAllocatedLaborByProject(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[] | null,
  currency: string,
): Promise<Map<string, MonthlyAllocatedLaborAggregate>> {
  const result = new Map<string, MonthlyAllocatedLaborAggregate>();
  if (projectIds !== null && projectIds.length === 0) return result;

  const conditions = [monthlyAllocatedJoinConditions(organizationId, currency)];
  if (projectIds !== null) {
    conditions.push(inArray(laborAllocationRunLines.projectId, [...projectIds]));
  }

  const rows = await db
    .select({
      projectId: laborAllocationRunLines.projectId,
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
    .where(and(...conditions))
    .groupBy(laborAllocationRunLines.projectId);

  const normalized = currency.toUpperCase();
  for (const row of rows) {
    result.set(row.projectId, {
      projectId: row.projectId,
      totalAmount: row.totalAmount,
      currency: normalized,
    });
  }
  return result;
}

export async function sumMonthlyAllocatedLaborForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<MonthlyAllocatedLaborAggregate> {
  const byProject = await sumMonthlyAllocatedLaborByProject(
    db,
    organizationId,
    [projectId],
    currency,
  );
  return (
    byProject.get(projectId) ?? {
      projectId,
      totalAmount: '0',
      currency: currency.toUpperCase(),
    }
  );
}

/** Σ run.unallocated_amount for applied runs on applied/closed months. */
export async function sumOrganizationMonthlyLaborUnallocated(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<{ totalAmount: string; currency: string }> {
  const [row] = await db
    .select({
      totalAmount: sql<string>`coalesce(sum(${laborAllocationRuns.unallocatedAmount}), 0)::text`,
    })
    .from(laborAllocationRuns)
    .innerJoin(
      employeeMonthCosts,
      and(
        eq(laborAllocationRuns.employeeMonthCostId, employeeMonthCosts.id),
        eq(laborAllocationRuns.organizationId, employeeMonthCosts.organizationId),
      ),
    )
    .where(
      and(
        eq(laborAllocationRuns.organizationId, organizationId),
        eq(laborAllocationRuns.status, 'applied'),
        inArray(employeeMonthCosts.status, [...appliedClosedStatuses]),
        eq(employeeMonthCosts.recognitionSource, 'monthly_allocated'),
        sql`upper(${laborAllocationRuns.currency}) = upper(${currency})`,
      ),
    );

  return {
    totalAmount: row?.totalAmount ?? '0',
    currency: currency.toUpperCase(),
  };
}

/** Displaced (employee, YYYY-MM) keys for applied/closed monthly_allocated months. */
export async function listDisplacedEmployeeMonthKeys(
  db: DbExecutor,
  organizationId: string,
): Promise<ReadonlySet<string>> {
  const rows = await db
    .select({
      employeeId: employeeMonthCosts.employeeId,
      yearMonth: employeeMonthCosts.yearMonth,
    })
    .from(employeeMonthCosts)
    .where(
      and(
        eq(employeeMonthCosts.organizationId, organizationId),
        inArray(employeeMonthCosts.status, [...appliedClosedStatuses]),
        eq(employeeMonthCosts.recognitionSource, 'monthly_allocated'),
      ),
    );

  return new Set(
    rows.map((row) => displacedEmployeeMonthKey(row.employeeId, row.yearMonth)),
  );
}

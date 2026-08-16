import { and, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import {
  allocationRuns,
  employeeMonthCosts,
  expenses,
  laborAllocationRuns,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { CompletenessCheckInput } from '../domain/completeness';
import { yearMonthBounds } from '../domain/year-month';

const SAMPLE_LIMIT = 12;

function rowsFromExecute<T extends Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

async function sampleIds(
  db: DbExecutor,
  query: Promise<{ id: string }[]>,
): Promise<{ count: number; ids: string[] }> {
  const rows = await query;
  return {
    count: rows.length,
    ids: rows.slice(0, SAMPLE_LIMIT).map((row) => row.id),
  };
}

/**
 * Gather transparent completeness signals for one operational month.
 * Does not invent Actual - only counts known incompleteness sources.
 */
export async function gatherCompletenessSignals(
  db: DbExecutor,
  organizationId: string,
  yearMonth: string,
): Promise<CompletenessCheckInput[]> {
  const { startDate, endDate } = yearMonthBounds(yearMonth);

  const [
    missingEmployerCost,
    unallocatedEmployeeCost,
    vendorBillsUnallocated,
    openTimeCorrections,
    apAnomalies,
    missingProjectAllocations,
    unresolvedExpenseDrafts,
    attendanceUsage,
    incompleteAttendance,
    openOverheadAllocation,
  ] = await Promise.all([
    countMissingEmployerCostActual(db, organizationId, yearMonth, startDate, endDate),
    countUnallocatedEmployeeCost(db, organizationId, yearMonth),
    countVendorBillsUnallocated(db, organizationId, startDate, endDate),
    countOpenTimeCorrections(db, organizationId, startDate, endDate),
    countApAnomalies(db, organizationId, startDate, endDate),
    countMissingProjectAllocations(db, organizationId, startDate, endDate),
    countUnresolvedExpenseDrafts(db, organizationId, startDate, endDate),
    orgUsesAttendanceThisMonth(db, organizationId, startDate, endDate),
    countIncompleteAttendance(db, organizationId, startDate, endDate),
    countOpenOverheadAllocation(db, organizationId, startDate, endDate),
  ]);

  return [
    {
      key: 'missing_employer_cost_actual',
      applicable: true,
      issueCount: missingEmployerCost.count,
      sampleEntityIds: missingEmployerCost.ids,
    },
    {
      key: 'unallocated_employee_cost',
      applicable: true,
      issueCount: unallocatedEmployeeCost.count,
      sampleEntityIds: unallocatedEmployeeCost.ids,
    },
    {
      key: 'vendor_bills_unallocated',
      applicable: true,
      issueCount: vendorBillsUnallocated.count,
      sampleEntityIds: vendorBillsUnallocated.ids,
    },
    {
      key: 'open_time_corrections',
      applicable: true,
      issueCount: openTimeCorrections.count,
      sampleEntityIds: openTimeCorrections.ids,
    },
    {
      key: 'ap_anomalies',
      applicable: true,
      issueCount: apAnomalies.count,
      sampleEntityIds: apAnomalies.ids,
    },
    {
      key: 'missing_project_allocations',
      applicable: true,
      issueCount: missingProjectAllocations.count,
      sampleEntityIds: missingProjectAllocations.ids,
    },
    {
      key: 'unresolved_expense_drafts',
      applicable: true,
      issueCount: unresolvedExpenseDrafts.count,
      sampleEntityIds: unresolvedExpenseDrafts.ids,
    },
    {
      key: 'incomplete_attendance',
      applicable: attendanceUsage,
      issueCount: incompleteAttendance.count,
      sampleEntityIds: incompleteAttendance.ids,
    },
    {
      key: 'open_overhead_allocation',
      applicable: true,
      issueCount: openOverheadAllocation.count,
      sampleEntityIds: openOverheadAllocation.ids,
    },
  ];
}

/** Active employees with time in month (or a month-cost row) lacking knownQuality=actual. */
async function countMissingEmployerCostActual(
  db: DbExecutor,
  organizationId: string,
  yearMonth: string,
  startDate: string,
  endDate: string,
): Promise<{ count: number; ids: string[] }> {
  const result = await db.execute(sql`
    WITH candidates AS (
      SELECT DISTINCT e.id
      FROM employees e
      WHERE e.organization_id = ${organizationId}::uuid
        AND e.status = 'active'
        AND e.archived_at IS NULL
        AND (
          EXISTS (
            SELECT 1 FROM time_entries te
            WHERE te.organization_id = e.organization_id
              AND te.employee_id = e.id
              AND te.status = 'recorded'
              AND te.work_date >= ${startDate}
              AND te.work_date <= ${endDate}
              AND te.archived_at IS NULL
          )
          OR EXISTS (
            SELECT 1 FROM employee_month_costs emc
            WHERE emc.organization_id = e.organization_id
              AND emc.employee_id = e.id
              AND emc.year_month = ${yearMonth}
              AND emc.status IN ('draft', 'applied', 'closed')
          )
        )
    )
    SELECT c.id
    FROM candidates c
    WHERE NOT EXISTS (
      SELECT 1 FROM employee_month_costs emc
      WHERE emc.organization_id = ${organizationId}::uuid
        AND emc.employee_id = c.id
        AND emc.year_month = ${yearMonth}
        AND emc.status IN ('draft', 'applied', 'closed')
        AND emc.known_quality = 'actual'
    )
    ORDER BY c.id
    LIMIT 200
  `);

  const list = rowsFromExecute<{ id: string }>(result);
  return {
    count: list.length,
    ids: list.slice(0, SAMPLE_LIMIT).map((row) => String(row.id)),
  };
}

async function countUnallocatedEmployeeCost(
  db: DbExecutor,
  organizationId: string,
  yearMonth: string,
): Promise<{ count: number; ids: string[] }> {
  const rows = await db
    .select({ id: laborAllocationRuns.id })
    .from(laborAllocationRuns)
    .innerJoin(
      employeeMonthCosts,
      and(
        eq(employeeMonthCosts.id, laborAllocationRuns.employeeMonthCostId),
        eq(employeeMonthCosts.organizationId, laborAllocationRuns.organizationId),
      ),
    )
    .where(
      and(
        eq(laborAllocationRuns.organizationId, organizationId),
        eq(laborAllocationRuns.status, 'applied'),
        eq(employeeMonthCosts.yearMonth, yearMonth),
        sql`${laborAllocationRuns.unallocatedAmount}::numeric > 0`,
      ),
    )
    .limit(200);

  return {
    count: rows.length,
    ids: rows.slice(0, SAMPLE_LIMIT).map((row) => row.id),
  };
}

async function countVendorBillsUnallocated(
  db: DbExecutor,
  organizationId: string,
  startDate: string,
  endDate: string,
): Promise<{ count: number; ids: string[] }> {
  const result = await db.execute(sql`
    SELECT b.id
    FROM ap_bills b
    WHERE b.organization_id = ${organizationId}::uuid
      AND b.archived_at IS NULL
      AND b.status IN ('open', 'partially_matched', 'matched')
      AND b.bill_date IS NOT NULL
      AND b.bill_date >= ${startDate}
      AND b.bill_date <= ${endDate}
      AND EXISTS (
        SELECT 1 FROM ap_bill_project_allocations a
        WHERE a.organization_id = b.organization_id
          AND a.ap_bill_id = b.id
          AND a.status = 'applied'
      )
      AND (
        b.total_amount::numeric
        - COALESCE((
            SELECT SUM(a.amount::numeric)
            FROM ap_bill_project_allocations a
            WHERE a.organization_id = b.organization_id
              AND a.ap_bill_id = b.id
              AND a.status = 'applied'
          ), 0)
      ) > 0.000001
    ORDER BY b.id
    LIMIT 200
  `);

  const list = rowsFromExecute<{ id: string }>(result);
  return {
    count: list.length,
    ids: list.slice(0, SAMPLE_LIMIT).map((row) => String(row.id)),
  };
}

async function countOpenTimeCorrections(
  db: DbExecutor,
  organizationId: string,
  startDate: string,
  endDate: string,
): Promise<{ count: number; ids: string[] }> {
  const result = await db.execute(sql`
    SELECT r.id
    FROM approval_requests r
    INNER JOIN time_entries te
      ON te.id = r.entity_id
     AND te.organization_id = r.organization_id
    WHERE r.organization_id = ${organizationId}::uuid
      AND r.entity_type = 'time_correction'
      AND r.status = 'submitted'
      AND te.work_date >= ${startDate}
      AND te.work_date <= ${endDate}
      AND te.archived_at IS NULL
    ORDER BY r.id
    LIMIT 200
  `);

  const list = rowsFromExecute<{ id: string }>(result);
  return {
    count: list.length,
    ids: list.slice(0, SAMPLE_LIMIT).map((row) => String(row.id)),
  };
}

async function countApAnomalies(
  db: DbExecutor,
  organizationId: string,
  startDate: string,
  endDate: string,
): Promise<{ count: number; ids: string[] }> {
  const result = await db.execute(sql`
    SELECT b.id
    FROM ap_bills b
    WHERE b.organization_id = ${organizationId}::uuid
      AND b.archived_at IS NULL
      AND b.status <> 'void'
      AND b.bill_date IS NOT NULL
      AND b.bill_date >= ${startDate}
      AND b.bill_date <= ${endDate}
      AND (
        b.status = 'partially_matched'
        OR ABS(
          b.total_amount::numeric
          - COALESCE((
              SELECT SUM(l.line_total::numeric)
              FROM ap_bill_lines l
              WHERE l.organization_id = b.organization_id
                AND l.ap_bill_id = b.id
            ), 0)
        ) > 0.01
        OR COALESCE((
            SELECT SUM(a.amount::numeric)
            FROM ap_bill_project_allocations a
            WHERE a.organization_id = b.organization_id
              AND a.ap_bill_id = b.id
              AND a.status = 'applied'
          ), 0) > b.total_amount::numeric + 0.000001
      )
    ORDER BY b.id
    LIMIT 200
  `);

  const list = rowsFromExecute<{ id: string }>(result);
  return {
    count: list.length,
    ids: list.slice(0, SAMPLE_LIMIT).map((row) => String(row.id)),
  };
}

async function countMissingProjectAllocations(
  db: DbExecutor,
  organizationId: string,
  startDate: string,
  endDate: string,
): Promise<{ count: number; ids: string[] }> {
  const expenseRows = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, organizationId),
        eq(expenses.status, 'finalized'),
        eq(expenses.costFamily, 'direct_project'),
        isNull(expenses.projectId),
        isNull(expenses.archivedAt),
        gte(expenses.expenseDate, startDate),
        lte(expenses.expenseDate, endDate),
      ),
    )
    .limit(100);

  const billResult = await db.execute(sql`
    SELECT b.id
    FROM ap_bills b
    WHERE b.organization_id = ${organizationId}::uuid
      AND b.archived_at IS NULL
      AND b.status IN ('open', 'partially_matched', 'matched')
      AND b.bill_date IS NOT NULL
      AND b.bill_date >= ${startDate}
      AND b.bill_date <= ${endDate}
      AND b.project_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM ap_bill_project_allocations a
        WHERE a.organization_id = b.organization_id
          AND a.ap_bill_id = b.id
          AND a.status IN ('draft', 'applied')
      )
    ORDER BY b.id
    LIMIT 100
  `);

  const bills = rowsFromExecute<{ id: string }>(billResult);
  const combined = [...expenseRows.map((r) => r.id), ...bills.map((r) => String(r.id))];
  return {
    count: combined.length,
    ids: combined.slice(0, SAMPLE_LIMIT),
  };
}

async function countUnresolvedExpenseDrafts(
  db: DbExecutor,
  organizationId: string,
  startDate: string,
  endDate: string,
): Promise<{ count: number; ids: string[] }> {
  return sampleIds(
    db,
    db
      .select({ id: expenses.id })
      .from(expenses)
      .where(
        and(
          eq(expenses.organizationId, organizationId),
          eq(expenses.status, 'draft'),
          isNull(expenses.archivedAt),
          gte(expenses.expenseDate, startDate),
          lte(expenses.expenseDate, endDate),
        ),
      )
      .limit(200),
  );
}

/**
 * Attendance is applicable for this month when the org actually used it here:
 * attendance_days in the month, or recorded time_entries paired with any
 * historical attendance usage. Lifetime-only "has a row somewhere" is too weak.
 */
async function orgUsesAttendanceThisMonth(
  db: DbExecutor,
  organizationId: string,
  startDate: string,
  endDate: string,
): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT (
      EXISTS (
        SELECT 1
        FROM attendance_days d
        WHERE d.organization_id = ${organizationId}::uuid
          AND d.archived_at IS NULL
          AND d.status <> 'void'
          AND d.work_date >= ${startDate}
          AND d.work_date <= ${endDate}
      )
      OR (
        EXISTS (
          SELECT 1
          FROM attendance_days d
          WHERE d.organization_id = ${organizationId}::uuid
            AND d.archived_at IS NULL
            AND d.status <> 'void'
        )
        AND EXISTS (
          SELECT 1
          FROM time_entries te
          WHERE te.organization_id = ${organizationId}::uuid
            AND te.status = 'recorded'
            AND te.archived_at IS NULL
            AND te.work_date >= ${startDate}
            AND te.work_date <= ${endDate}
        )
      )
    ) AS used
  `);
  const rows = rowsFromExecute<{ used: boolean }>(result);
  return Boolean(rows[0]?.used);
}

async function countIncompleteAttendance(
  db: DbExecutor,
  organizationId: string,
  startDate: string,
  endDate: string,
): Promise<{ count: number; ids: string[] }> {
  const result = await db.execute(sql`
    SELECT id FROM (
      SELECT d.id
      FROM attendance_days d
      WHERE d.organization_id = ${organizationId}::uuid
        AND d.archived_at IS NULL
        AND d.status = 'open'
        AND d.work_date >= ${startDate}
        AND d.work_date <= ${endDate}

      UNION

      SELECT te.id
      FROM time_entries te
      WHERE te.organization_id = ${organizationId}::uuid
        AND te.status = 'recorded'
        AND te.archived_at IS NULL
        AND te.work_date >= ${startDate}
        AND te.work_date <= ${endDate}
        AND EXISTS (
          SELECT 1
          FROM attendance_days any_day
          WHERE any_day.organization_id = te.organization_id
            AND any_day.archived_at IS NULL
            AND any_day.status <> 'void'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM attendance_days d
          WHERE d.organization_id = te.organization_id
            AND d.employee_id = te.employee_id
            AND d.work_date = te.work_date
            AND d.status = 'complete'
            AND d.archived_at IS NULL
        )
    ) issues
    ORDER BY id
    LIMIT 200
  `);

  const list = rowsFromExecute<{ id: string }>(result);
  return {
    count: list.length,
    ids: list.slice(0, SAMPLE_LIMIT).map((row) => String(row.id)),
  };
}

async function countOpenOverheadAllocation(
  db: DbExecutor,
  organizationId: string,
  startDate: string,
  endDate: string,
): Promise<{ count: number; ids: string[] }> {
  const rows = await db
    .select({ id: allocationRuns.id })
    .from(allocationRuns)
    .innerJoin(
      expenses,
      and(
        eq(expenses.id, allocationRuns.expenseId),
        eq(expenses.organizationId, allocationRuns.organizationId),
      ),
    )
    .where(
      and(
        eq(allocationRuns.organizationId, organizationId),
        eq(allocationRuns.status, 'draft'),
        inArray(expenses.costFamily, ['shared', 'business_overhead']),
        isNull(expenses.archivedAt),
        ne(expenses.status, 'void'),
        sql`(
          (${expenses.expenseDate} >= ${startDate} AND ${expenses.expenseDate} <= ${endDate})
          OR (
            ${expenses.allocationPeriodStart} IS NOT NULL
            AND ${expenses.allocationPeriodEnd} IS NOT NULL
            AND ${expenses.allocationPeriodStart} <= ${endDate}
            AND ${expenses.allocationPeriodEnd} >= ${startDate}
          )
        )`,
      ),
    )
    .limit(200);

  return {
    count: rows.length,
    ids: rows.slice(0, SAMPLE_LIMIT).map((row) => row.id),
  };
}

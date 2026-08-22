/**
 * One-time / repeatable bootstrap for EXISTING open-period workforce costing.
 *
 * Explicit administrative path (workforce.cost.manage) — not a GET, not a fake
 * salary edit. Idempotent. Skips closed months.
 */

import { sql } from 'drizzle-orm';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { ORG_LIST_EXPORT_CAP } from '@/shared/db/list-limits';
import { listTimeEntries } from '../data/time-entries.repository';
import { assertCanManageWorkforceCost } from './workforce-cost-authz';
import { recomputeDailyEmployeeCostsForDates } from './daily-cost-recompute';
import {
  recomputeMonthlyEmployeeCostForOpenMonth,
  recomputeOpenMonthsAfterCompensationChange,
  type MonthlyCostRecomputeResult,
} from './monthly-cost-recompute';
import {
  reconcileMissingTimeEntryCosts,
  type TimeEntryCostReconcileResult,
} from './time-entry-cost-reconcile';
import type { DailyCostRecomputeResult } from './daily-cost-recompute';

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

export interface WorkforceCostingBootstrapResult {
  readonly monthlyEmployees: number;
  readonly monthlyResults: readonly MonthlyCostRecomputeResult[];
  readonly monthlyApplied: number;
  readonly monthlySkippedClosed: number;
  readonly dailyResults: readonly DailyCostRecomputeResult[];
  readonly dailyUpdated: number;
  readonly snapshotReconcile: TimeEntryCostReconcileResult;
}

async function listEmployeeIdsByRateUnit(
  context: OrgContext,
  rateUnit: 'monthly' | 'daily' | 'hourly',
): Promise<readonly string[]> {
  const result = await context.db.execute(sql`
    select distinct employee_id::text as employee_id
    from rate_versions
    where organization_id = ${context.organizationId}::uuid
      and rate_unit = ${rateUnit}
    order by employee_id
  `);
  return resultRows<{ employee_id: string }>(result)
    .map((row) => row.employee_id)
    .filter(Boolean);
}

/**
 * Initialize / refresh open-period costing for the whole organization:
 * - monthly → pool + allocation + displacement
 * - daily → conserved day snapshots for approved work
 * - hourly → missing snapshot reconcile (0067 still required for approved fill)
 *
 * Safe to run repeatedly. Closed periods are never rewritten.
 */
export async function bootstrapOpenPeriodWorkforceCosting(
  context: OrgContext,
): Promise<WorkforceCostingBootstrapResult> {
  assertCanManageWorkforceCost(context);

  const monthlyEmployeeIds = await listEmployeeIdsByRateUnit(context, 'monthly');
  const monthlyResults: MonthlyCostRecomputeResult[] = [];
  for (const employeeId of monthlyEmployeeIds) {
    const results = await recomputeOpenMonthsAfterCompensationChange(context, employeeId);
    monthlyResults.push(...results);
  }

  const dailyEmployeeIds = await listEmployeeIdsByRateUnit(context, 'daily');
  const dailyResults: DailyCostRecomputeResult[] = [];
  for (const employeeId of dailyEmployeeIds) {
    const entries = await listTimeEntries(context.db, context.organizationId, {
      employeeId,
      forCosting: true,
      limit: ORG_LIST_EXPORT_CAP,
    });
    const workDates = [...new Set(entries.map((e) => e.workDate))];
    if (workDates.length === 0) continue;
    const results = await recomputeDailyEmployeeCostsForDates(context, {
      employeeId,
      workDates,
    });
    dailyResults.push(...results);
  }

  const snapshotReconcile = await reconcileMissingTimeEntryCosts(context);

  // Avoid double monthly work inside reconcile's post-hook for employees already done:
  // reconcileOpenMonths runs again — idempotent, acceptable for bootstrap closure.

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'workforce_costing_bootstrap',
    entityId: context.organizationId,
    after: {
      monthlyEmployees: monthlyEmployeeIds.length,
      monthlyApplied: monthlyResults.filter((r) => !r.skipped).length,
      monthlySkippedClosed: monthlyResults.filter((r) => r.reason === 'month_closed').length,
      dailyUpdated: dailyResults.reduce((sum, r) => sum + r.updated, 0),
      snapshotUpdated: snapshotReconcile.updated,
    },
  });

  return {
    monthlyEmployees: monthlyEmployeeIds.length,
    monthlyResults,
    monthlyApplied: monthlyResults.filter((r) => !r.skipped).length,
    monthlySkippedClosed: monthlyResults.filter((r) => r.reason === 'month_closed').length,
    dailyResults,
    dailyUpdated: dailyResults.reduce((sum, r) => sum + r.updated, 0),
    snapshotReconcile,
  };
}

/** Targeted bootstrap for one employee (open months only). */
export async function bootstrapOpenPeriodWorkforceCostingForEmployee(
  context: OrgContext,
  employeeId: string,
): Promise<{
  readonly monthly: readonly MonthlyCostRecomputeResult[];
  readonly daily: readonly DailyCostRecomputeResult[];
  readonly snapshotReconcile: TimeEntryCostReconcileResult;
}> {
  assertCanManageWorkforceCost(context);

  const monthly = await recomputeOpenMonthsAfterCompensationChange(context, employeeId);

  const entries = await listTimeEntries(context.db, context.organizationId, {
    employeeId,
    forCosting: true,
    limit: ORG_LIST_EXPORT_CAP,
  });
  const daily = await recomputeDailyEmployeeCostsForDates(context, {
    employeeId,
    workDates: [...new Set(entries.map((e) => e.workDate))],
  });

  const snapshotReconcile = await reconcileMissingTimeEntryCosts(context, { employeeId });

  return { monthly, daily, snapshotReconcile };
}

/** Test seam — ensure a known open month is touched for one monthly employee. */
export async function bootstrapEmployeeOpenMonth(
  context: OrgContext,
  input: { readonly employeeId: string; readonly yearMonth: string },
): Promise<MonthlyCostRecomputeResult> {
  assertCanManageWorkforceCost(context);
  return recomputeMonthlyEmployeeCostForOpenMonth(context, input);
}

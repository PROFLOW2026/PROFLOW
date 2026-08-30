/**
 * Recompute open-month general business cost pool and auto project allocations.
 * Frozen months are left unchanged (Month Close integrity).
 */

import { and, eq, isNull } from 'drizzle-orm';
import { projects } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { fromNumericString, money, toNumericString, zeroMoney } from '@/shared/money';
import { isMonthClosed, yearMonthFromBusinessDate } from '@/modules/month-close';
import { todayInTimeZone } from '@/shared/dates';
import {
  sumOrganizationMonthlyLaborUnallocated,
  sumOrganizationNonProjectLaborCost,
} from '@/modules/workforce';
import { sumRecognizedApGeneralRemainders } from '@/modules/ap';
import {
  sumUnallocatedExpensesForMonth,
} from '../data/expenses.repository';
import { sumInventoryWriteoffsForMonth } from '../data/inventory-consumptions.repository';
import {
  findGeneralCostMonth,
  persistGeneralCostMonthRecompute,
} from '../data/general-cost-months.repository';
import { listScheduleLines } from '@/modules/expenses';
import {
  allocateGeneralPoolByDirectActual,
  assertGeneralPoolConserves,
} from '../domain/general-cost-allocation';
import {
  buildGeneralCostSourceKey,
  sumGeneralCostSources,
  type GeneralCostSourceAtom,
} from '../domain/company-actual';
import { loadProjectFinancialsBatch } from './load-project-financials-batch';
import { isFutureEconomicYearMonth } from '../domain/general-cost-actual-recognition';

export interface RecomputeGeneralCostMonthResult {
  readonly yearMonth: string;
  readonly skipped: boolean;
  readonly reason: null | 'frozen' | 'month_closed_without_row' | 'future_economic_period';
  readonly poolAmount: string;
  readonly allocatedAmount: string;
  readonly unallocatableAmount: string;
  readonly projectCount: number;
}

/**
 * Rebuild open general-cost month from current recognized sources.
 * Direct Actual basis uses composed project Actual BEFORE auto-general
 * (loaders must not include general allocations in the basis — see compose).
 */
export async function recomputeGeneralCostMonth(
  context: OrgContext,
  yearMonth: string,
): Promise<RecomputeGeneralCostMonthResult> {
  assertPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  const currency = context.organization.baseCurrency;

  if (isFutureEconomicYearMonth(yearMonth, context.organization.timezone)) {
    return {
      yearMonth,
      skipped: true,
      reason: 'future_economic_period',
      poolAmount: '0',
      allocatedAmount: '0',
      unallocatableAmount: '0',
      projectCount: 0,
    };
  }

  const existing = await findGeneralCostMonth(
    context.db,
    context.organizationId,
    yearMonth,
    currency,
  );
  if (existing?.status === 'frozen') {
    return {
      yearMonth,
      skipped: true,
      reason: 'frozen',
      poolAmount: existing.poolAmount,
      allocatedAmount: existing.allocatedAmount,
      unallocatableAmount: existing.unallocatableAmount,
      projectCount: 0,
    };
  }

  const closed = await isMonthClosed(context, yearMonth);
  if (closed && !existing) {
    // Do not invent open-month rows under a closed period without Owner reopen flow.
    return {
      yearMonth,
      skipped: true,
      reason: 'month_closed_without_row',
      poolAmount: '0',
      allocatedAmount: '0',
      unallocatableAmount: '0',
      projectCount: 0,
    };
  }

  const canExpenses = hasPermission(context, PERMISSIONS.EXPENSES_READ);
  const canWorkforce = hasPermission(context, PERMISSIONS.WORKFORCE_READ);
  const canAp = hasPermission(context, PERMISSIONS.AP_READ);

  const sources: GeneralCostSourceAtom[] = [];

  if (canExpenses) {
    const monthExpenseGeneral = await sumUnallocatedExpensesForMonth(
      context.db,
      context.organizationId,
      currency,
      yearMonth,
    );
    if (Number(monthExpenseGeneral.amount) !== 0) {
      sources.push({
        kind: 'expense_unallocated',
        amount: monthExpenseGeneral,
        label: 'expense_unallocated',
      });
    }
  }

  if (canWorkforce) {
    const [monthlyUnalloc, nonProject] = await Promise.all([
      sumOrganizationMonthlyLaborUnallocated(context.db, context.organizationId, currency, {
        yearMonth,
      }),
      sumOrganizationNonProjectLaborCost(context.db, context.organizationId, currency, {
        yearMonth,
      }),
    ]);
    const monthlyAmount =
      fromNumericString(monthlyUnalloc.totalAmount, currency) ?? zeroMoney(currency);
    if (Number(monthlyAmount.amount) !== 0) {
      sources.push({
        kind: 'labor_monthly_unallocated',
        amount: monthlyAmount,
        label: 'labor_monthly_unallocated',
      });
    }
    const nonProjectAmount =
      fromNumericString(nonProject.totalAmount, currency) ?? zeroMoney(currency);
    if (Number(nonProjectAmount.amount) !== 0) {
      sources.push({
        kind: 'labor_non_project',
        amount: nonProjectAmount,
        label: 'labor_non_project',
      });
    }
  }

  if (canAp) {
    const ap = await sumRecognizedApGeneralRemainders(
      context.db,
      context.organizationId,
      currency,
      yearMonth,
    );
    if (Number(ap.remainderFromUnderAllocatedBills.amount) !== 0) {
      sources.push({
        kind: 'ap_bill_remainder',
        amount: ap.remainderFromUnderAllocatedBills,
        label: 'ap_bill_remainder',
      });
    }
    if (Number(ap.remainderFromNullProjectBills.amount) !== 0) {
      sources.push({
        kind: 'ap_bill_null_project',
        amount: ap.remainderFromNullProjectBills,
        label: 'ap_bill_null_project',
      });
    }
  }

  // Inventory write-offs (no project) — remaining stock is NOT a pool source.
  {
    const writeoffs = await sumInventoryWriteoffsForMonth(
      context.db,
      context.organizationId,
      currency,
      yearMonth,
    );
    if (Number(writeoffs.amount) !== 0) {
      sources.push({
        kind: 'inventory_writeoff',
        amount: writeoffs,
        label: 'inventory_writeoff',
      });
    }
  }

  const pool = sumGeneralCostSources(sources, currency);

  // Eligible projects: active, not archived, base currency.
  const projectRows = await context.db
    .select({
      id: projects.id,
      status: projects.status,
      currency: projects.currency,
      expectedRemainingCostAmount: projects.expectedRemainingCostAmount,
      workKind: projects.workKind,
      pricingMode: projects.pricingMode,
    })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, context.organizationId),
        eq(projects.status, 'active'),
        isNull(projects.archivedAt),
      ),
    );

  const eligibleIds = projectRows
    .filter((row) => (row.currency ?? currency).toUpperCase() === currency.toUpperCase())
    .map((row) => row.id);

  const forecastByProject = new Map(
    projectRows
      .filter((row) => eligibleIds.includes(row.id))
      .map((row) => [
        row.id,
        {
          currency: (row.currency ?? currency).toUpperCase(),
          expectedRemainingCostAmount: row.expectedRemainingCostAmount,
          workKind: row.workKind,
          pricingMode: row.pricingMode,
        },
      ]),
  );

  // Direct Actual for weights: composed Actual WITHOUT auto-general
  // (compose adds general after this path stores allocations).
  const financialsByProject =
    eligibleIds.length > 0
      ? await loadProjectFinancialsBatch(context, eligibleIds, forecastByProject)
      : new Map();

  // Direct Actual for weights (not Full): actualCostToDate is Direct-only in compose.
  const bases = eligibleIds.map((projectId) => {
    const financials = financialsByProject.get(projectId);
    const standing = financials?.cost.actualCostToDate ?? zeroMoney(currency);
    const allocatedGeneral = financials?.cost.allocatedGeneralBusinessCost;
    const direct =
      allocatedGeneral && Number(allocatedGeneral.amount) !== 0
        ? money(
            String(Number(standing.amount) - Number(allocatedGeneral.amount)),
            currency,
          )
        : standing;
    return {
      projectId,
      directActual: direct,
    };
  });

  const allocation = allocateGeneralPoolByDirectActual({ pool, projects: bases });
  assertGeneralPoolConserves(allocation);

  await persistGeneralCostMonthRecompute(context.db, {
    organizationId: context.organizationId,
    yearMonth,
    currency,
    poolAmount: toNumericString(allocation.pool),
    allocatedAmount: toNumericString(allocation.allocated),
    unallocatableAmount: toNumericString(allocation.unallocatable),
    basisMode: allocation.basisMode,
    allocations: allocation.lines.map((line) => ({
      projectId: line.projectId,
      directActualBasis: toNumericString(line.directActualBasis),
      weightPercent: line.weightPercent,
      amount: toNumericString(line.amount),
      currency,
    })),
    sources: sources.map((source) => ({
      sourceKind: source.kind,
      sourceKey: buildGeneralCostSourceKey(source.kind, source.sourceId),
      sourceId: source.sourceId,
      amount: toNumericString(source.amount),
      currency,
      label: source.label,
    })),
  });

  return {
    yearMonth,
    skipped: false,
    reason: null,
    poolAmount: toNumericString(allocation.pool),
    allocatedAmount: toNumericString(allocation.allocated),
    unallocatableAmount: toNumericString(allocation.unallocatable),
    projectCount: allocation.lines.length,
  };
}

/** Recompute current org calendar month (open). */
export async function recomputeCurrentGeneralCostMonth(
  context: OrgContext,
): Promise<RecomputeGeneralCostMonthResult> {
  const today = todayInTimeZone(context.organization.timezone);
  return recomputeGeneralCostMonth(context, today.slice(0, 7));
}

export type OpenGeneralCostMonthTarget =
  | { readonly yearMonth: string }
  | { readonly date: string };

function resolveOpenGeneralCostYearMonth(
  context: OrgContext,
  target: OpenGeneralCostMonthTarget,
): string {
  if ('yearMonth' in target) return target.yearMonth;
  return yearMonthFromBusinessDate(target.date);
}

/**
 * Recompute general-cost pool for an open month when recognition changes.
 * Skips frozen rows and closed periods without an open row (same guards as recompute).
 */
export async function recomputeOpenGeneralCostMonthForDate(
  context: OrgContext,
  target: OpenGeneralCostMonthTarget,
): Promise<RecomputeGeneralCostMonthResult> {
  return recomputeGeneralCostMonth(context, resolveOpenGeneralCostYearMonth(context, target));
}

/** Best-effort refresh after a mutation — never throws to callers. */
export async function tryRecomputeOpenGeneralCostMonth(
  context: OrgContext,
  target: OpenGeneralCostMonthTarget,
): Promise<void> {
  try {
    const yearMonth = resolveOpenGeneralCostYearMonth(context, target);
    if (isFutureEconomicYearMonth(yearMonth, context.organization.timezone)) return;
    await recomputeOpenGeneralCostMonthForDate(context, target);
  } catch {
    // Recognition path already succeeded; stale general pool is acceptable until next hook/load.
  }
}

/**
 * Recompute expense_date month plus every schedule-line year_month (open only).
 * Pass `scheduleYearMonths` when lines were already voided / replaced (e.g. void path).
 */
export async function tryRecomputeOpenGeneralCostMonthsForExpense(
  context: OrgContext,
  expense: {
    readonly id: string;
    readonly expenseDate: string;
    readonly scheduleYearMonths?: readonly string[];
  },
): Promise<void> {
  try {
    const months = new Set<string>();
    months.add(yearMonthFromBusinessDate(expense.expenseDate));
    if (expense.scheduleYearMonths) {
      for (const yearMonth of expense.scheduleYearMonths) {
        months.add(yearMonth);
      }
    } else {
      const lines = await listScheduleLines(
        context.db,
        context.organizationId,
        expense.id,
      );
      for (const line of lines) {
        months.add(line.yearMonth);
      }
    }
    for (const yearMonth of [...months].sort()) {
      if (isFutureEconomicYearMonth(yearMonth, context.organization.timezone)) continue;
      await recomputeGeneralCostMonth(context, yearMonth);
    }
  } catch {
    // Recognition path already succeeded; stale general pool is acceptable until next hook/load.
  }
}

/** Fire-and-forget open-month refresh (mutation hooks). */
export function scheduleOpenGeneralCostRecompute(
  context: OrgContext,
  target: OpenGeneralCostMonthTarget,
): void {
  void tryRecomputeOpenGeneralCostMonth(context, target);
}

/** @deprecated Read surfaces must not mutate GCM. Use mutation hooks only. */
export async function refreshAllOpenGeneralCostMonthsForSurfaces(
  _context: OrgContext,
): Promise<void> {
  // Intentionally no-op: general cost month persistence is write-triggered only.
}

/** @deprecated Read surfaces must not mutate GCM. Use mutation hooks only. */
export async function refreshCurrentOpenGeneralCostMonthForSurfaces(
  _context: OrgContext,
): Promise<void> {
  // Intentionally no-op: general cost month persistence is write-triggered only.
}

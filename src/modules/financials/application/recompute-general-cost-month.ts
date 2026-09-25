/**
 * Recompute open-month general business cost pool and auto project allocations.
 * Frozen months are left unchanged (Month Close integrity).
 */

import { and, eq, isNull } from 'drizzle-orm';
import { projects } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { DomainRuleError, isAppError } from '@/shared/errors';
import { logger } from '@/shared/observability';
import { addMoney, fromNumericString, roundMoney, toNumericString, zeroMoney } from '@/shared/money';
import { isMonthClosed, yearMonthFromBusinessDate } from '@/modules/month-close';
import { todayInTimeZone } from '@/shared/dates';
import {
  sumOrganizationMonthlyLaborCompanyOnly,
  sumOrganizationMonthlyLaborUnallocated,
  sumOrganizationNonProjectLaborCost,
} from '@/modules/workforce';
import { sumRecognizedApGeneralRemainders } from '@/modules/ap';
import {
  sumCompanyOnlyExpensesForMonth,
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
import { loadDirectActualBasisByProject } from './load-direct-actual-basis-by-project';
import { isFutureEconomicYearMonth } from '../domain/general-cost-actual-recognition';

function observeGeneralCostRecomputeFailure(
  error: unknown,
  scope: Record<string, unknown>,
): never {
  logger.error('financials.general_cost_recompute_failed', {
    ...scope,
    message: error instanceof Error ? error.message : String(error),
    messageKey: isAppError(error) ? error.messageKey : undefined,
  });
  if (isAppError(error)) throw error;
  throw new DomainRuleError(
    'General cost month could not be refreshed',
    'financial.errors.generalCostRecomputeFailed',
    scope,
  );
}

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
 * Weights use loadDirectActualBasisByProject (Direct Actual, no GCM allocation).
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
    const [monthExpenseGeneral, monthExpenseCompanyOnly] = await Promise.all([
      sumUnallocatedExpensesForMonth(context.db, context.organizationId, currency, yearMonth),
      sumCompanyOnlyExpensesForMonth(context.db, context.organizationId, currency, yearMonth),
    ]);
    if (Number(monthExpenseGeneral.amount) !== 0) {
      sources.push({
        kind: 'expense_unallocated',
        amount: monthExpenseGeneral,
        label: 'expense_unallocated',
      });
    }
    if (Number(monthExpenseCompanyOnly.amount) !== 0) {
      sources.push({
        kind: 'expense_company_only',
        amount: monthExpenseCompanyOnly,
        label: 'expense_company_only',
      });
    }
  }

  if (canWorkforce) {
    const [monthlyUnalloc, monthlyCompanyOnly, nonProject] = await Promise.all([
      sumOrganizationMonthlyLaborUnallocated(context.db, context.organizationId, currency, {
        yearMonth,
      }),
      sumOrganizationMonthlyLaborCompanyOnly(context.db, context.organizationId, currency, {
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
    const companyOnlyLaborAmount =
      fromNumericString(monthlyCompanyOnly.totalAmount, currency) ?? zeroMoney(currency);
    if (Number(companyOnlyLaborAmount.amount) !== 0) {
      sources.push({
        kind: 'labor_company_only',
        amount: companyOnlyLaborAmount,
        label: 'labor_company_only',
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
    if (Number(ap.remainderFromUnderAllocatedBillsCompanyOnly.amount) !== 0) {
      sources.push({
        kind: 'ap_bill_remainder_company_only',
        amount: ap.remainderFromUnderAllocatedBillsCompanyOnly,
        label: 'ap_bill_remainder_company_only',
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

  const companyOnlyKinds = new Set([
    'expense_company_only',
    'labor_company_only',
    'ap_bill_remainder_company_only',
  ]);
  const autoPoolSources = sources.filter((source) => !companyOnlyKinds.has(source.kind));
  const companyOnlySources = sources.filter((source) => companyOnlyKinds.has(source.kind));
  const autoPool = sumGeneralCostSources(autoPoolSources, currency);
  const companyOnlyPool = sumGeneralCostSources(companyOnlySources, currency);
  const pool = sumGeneralCostSources(sources, currency);

  // Eligible projects: active, not archived, base currency.
  const projectRows = await context.db
    .select({
      id: projects.id,
      currency: projects.currency,
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

  // Canonical Direct Actual (inventory, labor, expenses, AP, month-close).
  // Does not include general-cost allocation, so weights are not understated.
  const bases =
    eligibleIds.length > 0
      ? await loadDirectActualBasisByProject(context, eligibleIds, currency)
      : [];

  const allocation = allocateGeneralPoolByDirectActual({ pool: autoPool, projects: bases });
  assertGeneralPoolConserves(allocation);
  const unallocatableWithCompanyOnly = roundMoney(
    addMoney(allocation.unallocatable, companyOnlyPool),
  );

  await persistGeneralCostMonthRecompute(context.db, {
    organizationId: context.organizationId,
    yearMonth,
    currency,
    poolAmount: toNumericString(pool),
    allocatedAmount: toNumericString(allocation.allocated),
    unallocatableAmount: toNumericString(unallocatableWithCompanyOnly),
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

/** Refresh after a mutation. Failures are logged and rethrown so the action is visible. */
export async function tryRecomputeOpenGeneralCostMonth(
  context: OrgContext,
  target: OpenGeneralCostMonthTarget,
): Promise<void> {
  const yearMonth = resolveOpenGeneralCostYearMonth(context, target);
  try {
    if (isFutureEconomicYearMonth(yearMonth, context.organization.timezone)) return;
    await recomputeOpenGeneralCostMonthForDate(context, target);
  } catch (error) {
    observeGeneralCostRecomputeFailure(error, { yearMonth });
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
  } catch (error) {
    observeGeneralCostRecomputeFailure(error, { expenseId: expense.id });
  }
}

/** Fire-and-forget open-month refresh. Rejection is logged; awaited callers still throw. */
export function scheduleOpenGeneralCostRecompute(
  context: OrgContext,
  target: OpenGeneralCostMonthTarget,
): void {
  void tryRecomputeOpenGeneralCostMonth(context, target).catch((error: unknown) => {
    logger.error('financials.general_cost_recompute_unhandled', {
      message: error instanceof Error ? error.message : String(error),
      messageKey: isAppError(error) ? error.messageKey : undefined,
    });
  });
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

/**
 * Read-only general-cost month pool + project allocation (no DB writes).
 * Used for current-month Actual activation and future Forecast derivation.
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  expenseManagerialScheduleLines,
  expenses,
  generalCostMonths,
  projects,
} from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { fromNumericString, toNumericString, zeroMoney, type MoneyValue } from '@/shared/money';
import { timedPhase } from '@/shared/perf/tab-profile';
import { filterClosedYearMonthsForFinancialsRead } from '@/modules/month-close';
import { sumRecognizedApGeneralRemaindersByYearMonth, type ApGeneralRemainderTotals } from '@/modules/ap';
import {
  foldGeneralCostNonApSourceRows,
  loadGeneralCostNonApSourceTotalsByMonths,
} from '../data/general-cost-sources.repository';
import type { GeneralCostMonthRow } from '../data/general-cost-months.repository';
import {
  allocateGeneralPoolByDirectActual,
  assertGeneralPoolConserves,
} from '../domain/general-cost-allocation';
import { sumGeneralCostSources, type GeneralCostSourceAtom } from '../domain/company-actual';
import { loadDirectActualBasisByProject } from './load-direct-actual-basis-by-project';
import {
  actualRecognitionThroughYearMonth,
  compareYearMonth,
  isFutureEconomicYearMonth,
} from '../domain/general-cost-actual-recognition';

export interface GeneralCostMonthPreviewLine {
  readonly projectId: string;
  readonly amount: MoneyValue;
  readonly weightPercent: string;
  readonly directActualBasis: MoneyValue;
}

export interface GeneralCostMonthPreviewResult {
  readonly yearMonth: string;
  readonly skipped: boolean;
  readonly reason:
    | null
    | 'frozen'
    | 'month_closed_without_row'
    | 'future_economic_period'
    | 'no_pool';
  readonly poolAmount: MoneyValue;
  readonly lines: readonly GeneralCostMonthPreviewLine[];
}

export type DirectActualAllocationBasis = {
  readonly projectId: string;
  readonly directActual: MoneyValue;
};

const allocationBasesByDb = new WeakMap<object, Promise<readonly DirectActualAllocationBasis[]>>();

/** One org-wide Direct Actual basis load per DB transaction — never per GCM month. */
export async function loadDirectActualAllocationBases(
  context: OrgContext,
): Promise<readonly DirectActualAllocationBasis[]> {
  const key = context.db as object;
  const hit = allocationBasesByDb.get(key);
  if (hit) return hit;
  const pending = loadDirectActualAllocationBasesUncached(context);
  allocationBasesByDb.set(key, pending);
  return pending;
}

async function loadDirectActualAllocationBasesUncached(
  context: OrgContext,
): Promise<readonly DirectActualAllocationBasis[]> {
  return timedPhase('loadDirectActualAllocationBases', () =>
    loadDirectActualAllocationBasesUncachedInner(context),
  );
}

async function loadDirectActualAllocationBasesUncachedInner(
  context: OrgContext,
): Promise<readonly DirectActualAllocationBasis[]> {
  const currency = context.organization.baseCurrency;
  const projectRows = await context.db
    .select({ id: projects.id, currency: projects.currency })
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

  return loadDirectActualBasisByProject(context, eligibleIds, currency);
}

function sourcesFromMonthTotals(input: {
  readonly currency: string;
  readonly expense: MoneyValue | undefined;
  readonly laborMonthly: string | undefined;
  readonly laborNonProject: string | undefined;
  readonly ap: ApGeneralRemainderTotals | undefined;
  readonly writeoffs: MoneyValue | undefined;
}): GeneralCostSourceAtom[] {
  const { currency } = input;
  const sources: GeneralCostSourceAtom[] = [];
  if (input.expense && Number(input.expense.amount) !== 0) {
    sources.push({
      kind: 'expense_unallocated',
      amount: input.expense,
      label: 'expense_unallocated',
    });
  }
  const monthlyAmount = fromNumericString(input.laborMonthly ?? '0', currency) ?? zeroMoney(currency);
  if (Number(monthlyAmount.amount) !== 0) {
    sources.push({
      kind: 'labor_monthly_unallocated',
      amount: monthlyAmount,
      label: 'labor_monthly_unallocated',
    });
  }
  const nonProjectAmount =
    fromNumericString(input.laborNonProject ?? '0', currency) ?? zeroMoney(currency);
  if (Number(nonProjectAmount.amount) !== 0) {
    sources.push({
      kind: 'labor_non_project',
      amount: nonProjectAmount,
      label: 'labor_non_project',
    });
  }
  if (input.ap && Number(input.ap.remainderFromUnderAllocatedBills.amount) !== 0) {
    sources.push({
      kind: 'ap_bill_remainder',
      amount: input.ap.remainderFromUnderAllocatedBills,
      label: 'ap_bill_remainder',
    });
  }
  if (input.ap && Number(input.ap.remainderFromNullProjectBills.amount) !== 0) {
    sources.push({
      kind: 'ap_bill_null_project',
      amount: input.ap.remainderFromNullProjectBills,
      label: 'ap_bill_null_project',
    });
  }
  if (input.writeoffs && Number(input.writeoffs.amount) !== 0) {
    sources.push({
      kind: 'inventory_writeoff',
      amount: input.writeoffs,
      label: 'inventory_writeoff',
    });
  }
  return sources;
}

export async function gatherGeneralCostSourcesByMonths(
  context: OrgContext,
  yearMonths: readonly string[],
): Promise<Map<string, GeneralCostSourceAtom[]>> {
  const result = new Map<string, GeneralCostSourceAtom[]>();
  if (yearMonths.length === 0) return result;
  const t0 = performance.now();
  const currency = context.organization.baseCurrency;
  const canExpenses = hasPermission(context, PERMISSIONS.EXPENSES_READ);
  const canWorkforce = hasPermission(context, PERMISSIONS.WORKFORCE_READ);
  const canAp = hasPermission(context, PERMISSIONS.AP_READ);

  const [nonApRows, apByMonth] = await Promise.all([
    loadGeneralCostNonApSourceTotalsByMonths(context.db, context.organizationId, currency, yearMonths, {
      includeExpenses: canExpenses,
      includeWorkforce: canWorkforce,
    }),
    canAp
      ? sumRecognizedApGeneralRemaindersByYearMonth(
          context.db,
          context.organizationId,
          currency,
          yearMonths,
        )
      : Promise.resolve(new Map()),
  ]);

  const { expenseByMonth, laborMonthlyByMonth, laborNonProjectByMonth, writeoffsByMonth } =
    foldGeneralCostNonApSourceRows(nonApRows, currency, yearMonths);

  for (const yearMonth of yearMonths) {
    result.set(
      yearMonth,
      sourcesFromMonthTotals({
        currency,
        expense: expenseByMonth.get(yearMonth),
        laborMonthly: laborMonthlyByMonth.get(yearMonth),
        laborNonProject: laborNonProjectByMonth.get(yearMonth),
        ap: apByMonth.get(yearMonth),
        writeoffs: writeoffsByMonth.get(yearMonth),
      }),
    );
  }

  if (process.env.PF_TAB_PROFILE === '1') {
    console.error(
      `[gcm-sources] months=${yearMonths.length} ms=${Math.round(performance.now() - t0)}`,
    );
  }
  return result;
}

export async function listGeneralCostMonthsByYearMonth(
  context: OrgContext,
  yearMonths: readonly string[],
): Promise<Map<string, GeneralCostMonthRow>> {
  const result = new Map<string, GeneralCostMonthRow>();
  if (yearMonths.length === 0) return result;
  const rows = await context.db
    .select()
    .from(generalCostMonths)
    .where(
      and(
        eq(generalCostMonths.organizationId, context.organizationId),
        eq(generalCostMonths.currency, context.organization.baseCurrency.toUpperCase()),
        inArray(generalCostMonths.yearMonth, [...yearMonths]),
      ),
    );
  for (const row of rows) result.set(row.yearMonth, row);
  return result;
}

export async function listClosedYearMonths(
  context: OrgContext,
  yearMonths: readonly string[],
): Promise<ReadonlySet<string>> {
  return filterClosedYearMonthsForFinancialsRead(context, yearMonths);
}

export function previewAllocationFromPreparedInputs(input: {
  readonly yearMonth: string;
  readonly currency: string;
  readonly timezone: string;
  readonly allowFuture: boolean;
  readonly existing: GeneralCostMonthRow | null | undefined;
  readonly monthClosed: boolean;
  readonly sources: readonly GeneralCostSourceAtom[];
  readonly bases: readonly DirectActualAllocationBasis[];
}): GeneralCostMonthPreviewResult {
  const { yearMonth, currency } = input;
  if (!input.allowFuture && isFutureEconomicYearMonth(yearMonth, input.timezone)) {
    return {
      yearMonth,
      skipped: true,
      reason: 'future_economic_period',
      poolAmount: zeroMoney(currency),
      lines: [],
    };
  }
  if (input.existing?.status === 'frozen') {
    return {
      yearMonth,
      skipped: true,
      reason: 'frozen',
      poolAmount: fromNumericString(input.existing.poolAmount, currency) ?? zeroMoney(currency),
      lines: [],
    };
  }
  if (input.monthClosed && !input.existing) {
    return {
      yearMonth,
      skipped: true,
      reason: 'month_closed_without_row',
      poolAmount: zeroMoney(currency),
      lines: [],
    };
  }
  const pool = sumGeneralCostSources(input.sources, currency);
  if (Number(pool.amount) === 0) {
    return {
      yearMonth,
      skipped: true,
      reason: 'no_pool',
      poolAmount: zeroMoney(currency),
      lines: [],
    };
  }
  const allocation = allocateGeneralPoolByDirectActual({
    pool,
    projects: [...input.bases],
  });
  assertGeneralPoolConserves(allocation);
  return {
    yearMonth,
    skipped: false,
    reason: null,
    poolAmount: allocation.pool,
    lines: allocation.lines.map((line) => ({
      projectId: line.projectId,
      amount: line.amount,
      weightPercent: line.weightPercent,
      directActualBasis: line.directActualBasis,
    })),
  };
}

export async function previewGeneralCostMonthAllocations(
  context: OrgContext,
  yearMonths: readonly string[],
  options?: { readonly allowFuture?: boolean },
): Promise<Map<string, GeneralCostMonthPreviewResult>> {
  const result = new Map<string, GeneralCostMonthPreviewResult>();
  if (yearMonths.length === 0) return result;
  const allowFuture = options?.allowFuture === true;
  const currency = context.organization.baseCurrency;
  const [bases, existingByMonth, closedMonths, sourcesByMonth] = await Promise.all([
    loadDirectActualAllocationBases(context),
    listGeneralCostMonthsByYearMonth(context, yearMonths),
    listClosedYearMonths(context, yearMonths),
    timedPhase('gatherGeneralCostSourcesByMonths', () =>
      gatherGeneralCostSourcesByMonths(context, yearMonths),
    ),
  ]);
  for (const yearMonth of yearMonths) {
    result.set(
      yearMonth,
      previewAllocationFromPreparedInputs({
        yearMonth,
        currency,
        timezone: context.organization.timezone,
        allowFuture,
        existing: existingByMonth.get(yearMonth),
        monthClosed: closedMonths.has(yearMonth),
        sources: sourcesByMonth.get(yearMonth) ?? [],
        bases,
      }),
    );
  }
  return result;
}

/**
 * Preview one month's general-cost pool allocation from live sources (no persist).
 * `allowFuture` enables forecast derivation for months after the org current month.
 */
export async function previewGeneralCostMonthAllocation(
  context: OrgContext,
  yearMonth: string,
  options?: { readonly allowFuture?: boolean },
): Promise<GeneralCostMonthPreviewResult> {
  const previews = await previewGeneralCostMonthAllocations(context, [yearMonth], options);
  const preview = previews.get(yearMonth);
  if (preview) return preview;
  return {
    yearMonth,
    skipped: true,
    reason: 'no_pool',
    poolAmount: zeroMoney(context.organization.baseCurrency),
    lines: [],
  };
}

export function previewLineAmountForProject(
  preview: GeneralCostMonthPreviewResult,
  projectId: string,
  currency: string,
): MoneyValue {
  const line = preview.lines.find((entry) => entry.projectId === projectId);
  return line?.amount ?? zeroMoney(currency);
}

/** Distinct future year-months with scheduled unallocated expense recognition. */
export async function listFutureGeneralCostCandidateMonths(
  context: OrgContext,
  afterYearMonth?: string,
): Promise<readonly string[]> {
  const through =
    afterYearMonth ?? actualRecognitionThroughYearMonth(context.organization.timezone);
  const rows = await context.db
    .selectDistinct({ yearMonth: expenseManagerialScheduleLines.yearMonth })
    .from(expenseManagerialScheduleLines)
    .innerJoin(expenses, eq(expenseManagerialScheduleLines.expenseId, expenses.id))
    .where(
      and(
        eq(expenseManagerialScheduleLines.organizationId, context.organizationId),
        sql`${expenseManagerialScheduleLines.yearMonth} > ${through}`,
        sql`${expenseManagerialScheduleLines.status} in ('scheduled', 'recognized')`,
        eq(expenses.status, 'finalized'),
        sql`${expenses.projectId} is null`,
        sql`not exists (
          select 1 from expense_allocations ea
          where ea.expense_id = ${expenses.id}
            and ea.project_id is not null
        )`,
      ),
    )
    .orderBy(expenseManagerialScheduleLines.yearMonth);

  return rows.map((row) => row.yearMonth);
}

export function isStrictlyBeforeYearMonth(yearMonth: string, before: string): boolean {
  return compareYearMonth(yearMonth, before) < 0;
}

export { toNumericString as previewAmountString };

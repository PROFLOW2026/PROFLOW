import { addMoney, money, subtractMoney, sumMoney, zeroMoney } from '@/shared/money';
import { moneyMetric, type MetricMoney } from './metric-value';

export interface CostControlAgreementRow {
  readonly agreementId: string;
  readonly vendorName: string | null;
  readonly title: string;
  readonly trade: string | null;
  readonly workPackageId: string | null;
  readonly status: string;
  readonly committed: MetricMoney;
  readonly approvedChanges: MetricMoney;
  readonly submittedClaims: MetricMoney;
  readonly certified: MetricMoney;
  readonly apActual: MetricMoney;
  readonly paid: MetricMoney;
  readonly retentionHeld: MetricMoney;
}

export type CostControlPackageCoverage = 'all' | 'partial' | 'none';

/** Trade rollup of agreement figures. Budget and forecast are separate slots, never folded into commitment. */
export interface CostControlTradeRollup {
  readonly tradeKey: string;
  readonly trade: string | null;
  readonly workPackageIds: readonly string[];
  readonly workPackages: readonly { readonly id: string; readonly name: string }[];
  readonly agreementIds: readonly string[];
  readonly packageCoverage: CostControlPackageCoverage;
  readonly committed: MetricMoney;
  readonly approvedChanges: MetricMoney;
  readonly submittedClaims: MetricMoney;
  readonly certified: MetricMoney;
  readonly apActual: MetricMoney;
  readonly paid: MetricMoney;
  readonly retentionHeld: MetricMoney;
  readonly originalBudget: MetricMoney;
  readonly approvedBudget: MetricMoney;
  readonly forecastRemaining: MetricMoney;
  readonly forecastFinal: MetricMoney;
}

/** One existing budget line, already loaded. Amount is that line's budget, not a derived mix. */
export interface CostControlBudgetLine {
  readonly revisionNumber: number;
  readonly lineType: string;
  readonly workPackageId: string | null;
  readonly disciplineKey: string | null;
  readonly costCodeId: string | null;
  readonly amount: string;
  readonly currency: string;
}

export interface TradeBudgetSource {
  /** False when the viewer lacks budgets.read — lines are ignored and budget cells stay unavailable. */
  readonly canReadBudget: boolean;
  readonly currency: string | null;
  /** Revision 1 lines (original budget). */
  readonly originalLines: readonly CostControlBudgetLine[];
  /** Current revision lines (approved budget). */
  readonly approvedLines: readonly CostControlBudgetLine[];
  /**
   * Current-revision amounts from `loadBudgetAmountsByCostCodeForProject`.
   * Used for an approved line only when that cost code belongs to exactly one line.
   */
  readonly approvedCostCodeAmounts: readonly {
    readonly costCodeId: string;
    readonly amount: string;
    readonly currency: string;
  }[];
}

export interface ClaimSubmittedInput {
  readonly agreementId: string;
  readonly currency: string;
  readonly status: string;
  readonly currentSubmitted: string;
}

const SUBMITTED_CLAIM_STATUSES = new Set(['submitted', 'under_review', 'returned']);

/** Sum in-flight submitted amounts per agreement (never mixed with certified totals). */
export function sumSubmittedClaimsByAgreement(
  claims: readonly ClaimSubmittedInput[],
): ReadonlyMap<string, { readonly amount: string; readonly currency: string }> {
  const buckets = new Map<string, ReturnType<typeof money>[]>();
  for (const claim of claims) {
    if (!SUBMITTED_CLAIM_STATUSES.has(claim.status)) continue;
    const list = buckets.get(claim.agreementId) ?? [];
    list.push(money(claim.currentSubmitted, claim.currency));
    buckets.set(claim.agreementId, list);
  }
  const out = new Map<string, { readonly amount: string; readonly currency: string }>();
  for (const [agreementId, amounts] of buckets) {
    if (amounts.length === 0) continue;
    const total = sumMoney(amounts, amounts[0]!.currency);
    out.set(agreementId, { amount: total.amount, currency: total.currency });
  }
  return out;
}

export function sumApNetFromBills(
  bills: readonly { readonly currency: string; readonly netAmount: string }[],
): { readonly amount: string; readonly currency: string } | null {
  if (bills.length === 0) return null;
  const currency = bills[0]!.currency;
  const total = sumMoney(
    bills.map((bill) => money(bill.netAmount, bill.currency)),
    currency,
  );
  return { amount: total.amount, currency };
}

export function buildCostControlAgreementRow(input: {
  readonly agreementId: string;
  readonly vendorName: string | null;
  readonly title: string;
  readonly trade: string | null;
  readonly workPackageId?: string | null;
  readonly status: string;
  readonly contractValue: { readonly original: string; readonly approvedChanges: string; readonly current: string; readonly currency: string } | null;
  readonly submittedClaims: { readonly amount: string; readonly currency: string } | null;
  readonly paymentTotals: { readonly certified: string; readonly paid: string; readonly retentionHeld: string; readonly currency: string } | null;
  readonly apNet: { readonly amount: string; readonly currency: string } | null;
}): CostControlAgreementRow {
  const currency = input.contractValue?.currency ?? input.paymentTotals?.currency ?? input.submittedClaims?.currency ?? input.apNet?.currency;
  return {
    agreementId: input.agreementId,
    vendorName: input.vendorName,
    title: input.title,
    trade: input.trade,
    workPackageId: input.workPackageId ?? null,
    status: input.status,
    committed: moneyMetric(input.contractValue?.current, input.contractValue?.currency),
    approvedChanges: moneyMetric(input.contractValue?.approvedChanges, input.contractValue?.currency),
    submittedClaims: moneyMetric(input.submittedClaims?.amount, input.submittedClaims?.currency ?? currency),
    certified: moneyMetric(input.paymentTotals?.certified, input.paymentTotals?.currency),
    apActual: moneyMetric(input.apNet?.amount, input.apNet?.currency),
    paid: moneyMetric(input.paymentTotals?.paid, input.paymentTotals?.currency),
    retentionHeld: moneyMetric(input.paymentTotals?.retentionHeld, input.paymentTotals?.currency),
  };
}

/** Helper for tests: merge two money metrics in the same currency (returns unavailable when mixed). */
export function addMetricMoney(a: MetricMoney, b: MetricMoney): MetricMoney {
  if (a.kind === 'unavailable' || b.kind === 'unavailable') return { kind: 'unavailable' };
  if (a.currency !== b.currency) return { kind: 'unavailable' };
  const sum = addMoney(money(a.amount, a.currency), money(b.amount, b.currency));
  return { kind: 'money', amount: sum.amount, currency: sum.currency };
}

export function zeroMetricMoney(currency: string): MetricMoney {
  return { kind: 'money', amount: zeroMoney(currency).amount, currency };
}

function unavailableMetric(): MetricMoney {
  return { kind: 'unavailable' };
}

/**
 * Forecast from figures the row already holds. Final is the current authorized
 * commitment (original plus approved changes). Remaining is that commitment
 * minus certified to date. Missing certified leaves remaining unavailable.
 * Nothing here is estimated.
 */
function forecastFromCommitment(
  committed: MetricMoney,
  certified: MetricMoney,
): { readonly remaining: MetricMoney; readonly final: MetricMoney } {
  const forecastFinal = committed.kind === 'money' ? committed : unavailableMetric();
  if (committed.kind !== 'money' || certified.kind !== 'money' || committed.currency !== certified.currency) {
    return { remaining: unavailableMetric(), final: forecastFinal };
  }
  try {
    const remaining = subtractMoney(
      money(committed.amount, committed.currency),
      money(certified.amount, certified.currency),
    );
    return {
      remaining: { kind: 'money', amount: remaining.amount, currency: remaining.currency },
      final: forecastFinal,
    };
  } catch {
    return { remaining: unavailableMetric(), final: forecastFinal };
  }
}

/** Sum one figure slot. Any unavailable member, empty list, or mixed currency stays unavailable. */
export function sumMetricMoney(metrics: readonly MetricMoney[]): MetricMoney {
  if (metrics.length === 0) return unavailableMetric();
  let currency: string | null = null;
  const amounts: { readonly amount: string; readonly currency: string }[] = [];
  for (const metric of metrics) {
    if (metric.kind !== 'money') return unavailableMetric();
    if (currency === null) currency = metric.currency;
    else if (metric.currency !== currency) return unavailableMetric();
    amounts.push({ amount: metric.amount, currency: metric.currency });
  }
  if (!currency) return unavailableMetric();
  try {
    const total = sumMoney(
      amounts.map((metric) => money(metric.amount, metric.currency)),
      currency,
    );
    return { kind: 'money', amount: total.amount, currency: total.currency };
  } catch {
    return unavailableMetric();
  }
}

function tradeKeyOf(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function packageCoverageOf(rows: readonly CostControlAgreementRow[]): CostControlPackageCoverage {
  const withPackage = rows.filter((row) => row.workPackageId).length;
  if (withPackage === 0) return 'none';
  if (withPackage === rows.length) return 'all';
  return 'partial';
}

/**
 * Group agreement rows by trade. Each money column is summed on its own.
 * Budget and forecast start unavailable — attach them only from a real budget read.
 */
export function rollupCostControlByTrade(
  rows: readonly CostControlAgreementRow[],
): CostControlTradeRollup[] {
  const groups = new Map<string, CostControlAgreementRow[]>();
  for (const row of rows) {
    const key = tradeKeyOf(row.trade);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const rollups: CostControlTradeRollup[] = [];
  for (const [tradeKey, members] of groups) {
    const trade = members.find((row) => tradeKeyOf(row.trade) === tradeKey && row.trade?.trim())?.trade?.trim() ?? null;
    const workPackageIds = [
      ...new Set(members.map((row) => row.workPackageId).filter((id): id is string => Boolean(id))),
    ];
    const committed = sumMetricMoney(members.map((row) => row.committed));
    const certified = sumMetricMoney(members.map((row) => row.certified));
    const forecast = forecastFromCommitment(committed, certified);
    rollups.push({
      tradeKey,
      trade,
      workPackageIds,
      workPackages: [],
      agreementIds: members.map((row) => row.agreementId),
      packageCoverage: packageCoverageOf(members),
      committed,
      approvedChanges: sumMetricMoney(members.map((row) => row.approvedChanges)),
      submittedClaims: sumMetricMoney(members.map((row) => row.submittedClaims)),
      certified,
      apActual: sumMetricMoney(members.map((row) => row.apActual)),
      paid: sumMetricMoney(members.map((row) => row.paid)),
      retentionHeld: sumMetricMoney(members.map((row) => row.retentionHeld)),
      originalBudget: unavailableMetric(),
      approvedBudget: unavailableMetric(),
      forecastRemaining: forecast.remaining,
      forecastFinal: forecast.final,
    });
  }

  return rollups.sort((a, b) => {
    if (a.tradeKey === b.tradeKey) return 0;
    if (!a.tradeKey) return 1;
    if (!b.tradeKey) return -1;
    return (a.trade ?? '').localeCompare(b.trade ?? '', undefined, { sensitivity: 'base' });
  });
}

function workPackageOwners(
  rollups: readonly CostControlTradeRollup[],
): ReadonlyMap<string, string | 'shared'> {
  const owners = new Map<string, string | 'shared'>();
  for (const rollup of rollups) {
    for (const id of rollup.workPackageIds) {
      const current = owners.get(id);
      if (!current) owners.set(id, rollup.tradeKey);
      else if (current !== rollup.tradeKey) owners.set(id, 'shared');
    }
  }
  return owners;
}

function uniqueCostCodeAmounts(
  slices: TradeBudgetSource['approvedCostCodeAmounts'],
): ReadonlyMap<string, { readonly amount: string; readonly currency: string }> {
  const buckets = new Map<string, { readonly amount: string; readonly currency: string }[]>();
  for (const slice of slices) {
    const list = buckets.get(slice.costCodeId) ?? [];
    list.push({ amount: slice.amount, currency: slice.currency });
    buckets.set(slice.costCodeId, list);
  }
  const out = new Map<string, { readonly amount: string; readonly currency: string }>();
  for (const [costCodeId, rows] of buckets) {
    if (rows.length !== 1) continue;
    out.set(costCodeId, rows[0]!);
  }
  return out;
}

function countCostCodes(lines: readonly CostControlBudgetLine[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) {
    if (!line.costCodeId) continue;
    counts.set(line.costCodeId, (counts.get(line.costCodeId) ?? 0) + 1);
  }
  return counts;
}

function amountOfLine(
  line: CostControlBudgetLine,
  headerCurrency: string | null,
  slices: ReadonlyMap<string, { readonly amount: string; readonly currency: string }> | null,
  counts: ReadonlyMap<string, number>,
): MetricMoney {
  if (slices && line.costCodeId && counts.get(line.costCodeId) === 1) {
    const slice = slices.get(line.costCodeId);
    if (slice) return moneyMetric(slice.amount, slice.currency);
  }
  return moneyMetric(line.amount, line.currency || headerCurrency);
}

/**
 * Pick budget lines that belong to this trade without mixing grains.
 * Work-package lines win only when every agreement in the trade has an exclusive package
 * and each of those packages has a line. Otherwise a discipline (trade) line is used
 * when no work-package line matched. Cost-code lines are used only when they themselves
 * carry a work package or discipline and no coarser line already covers the trade.
 * Project `total` lines are never spread onto a trade.
 */
function linesForTradeBudget(
  group: CostControlTradeRollup,
  lines: readonly CostControlBudgetLine[],
  owners: ReadonlyMap<string, string | 'shared'>,
): readonly CostControlBudgetLine[] {
  const exclusiveIds = group.workPackageIds.filter((id) => owners.get(id) === group.tradeKey);
  const wpLines = lines.filter(
    (line) =>
      line.lineType === 'work_package' &&
      line.workPackageId != null &&
      exclusiveIds.includes(line.workPackageId),
  );
  const covered = new Set(wpLines.map((line) => line.workPackageId));
  const wpComplete =
    group.packageCoverage === 'all' &&
    group.workPackageIds.length > 0 &&
    exclusiveIds.length === group.workPackageIds.length &&
    group.workPackageIds.every((id) => covered.has(id));
  if (wpComplete) return wpLines;

  const disciplineLines =
    group.tradeKey.length > 0
      ? lines.filter(
          (line) => line.lineType === 'discipline' && tradeKeyOf(line.disciplineKey) === group.tradeKey,
        )
      : [];
  if (wpLines.length === 0 && disciplineLines.length > 0) return disciplineLines;
  if (wpLines.length > 0 || disciplineLines.length > 0) return [];

  const costCodeLines = lines.filter((line) => line.lineType === 'cost_code');
  if (group.packageCoverage === 'all' && group.workPackageIds.length > 0) {
    const matched = costCodeLines.filter(
      (line) => line.workPackageId != null && exclusiveIds.includes(line.workPackageId),
    );
    const costCovered = new Set(matched.map((line) => line.workPackageId));
    const complete =
      exclusiveIds.length === group.workPackageIds.length &&
      group.workPackageIds.every((id) => costCovered.has(id));
    return complete ? matched : [];
  }
  if (group.packageCoverage === 'none' && group.tradeKey.length > 0) {
    return costCodeLines.filter((line) => tradeKeyOf(line.disciplineKey) === group.tradeKey);
  }
  return [];
}

function budgetMetricForGroup(
  group: CostControlTradeRollup,
  lines: readonly CostControlBudgetLine[],
  owners: ReadonlyMap<string, string | 'shared'>,
  headerCurrency: string | null,
  slices: ReadonlyMap<string, { readonly amount: string; readonly currency: string }> | null,
  counts: ReadonlyMap<string, number>,
): MetricMoney {
  const selected = linesForTradeBudget(group, lines, owners);
  return sumMetricMoney(selected.map((line) => amountOfLine(line, headerCurrency, slices, counts)));
}

/**
 * Attach original and approved budget onto trade rollups.
 * Forecast stays the commitment-minus-certified figure from the rollup.
 */
export function attachTradeBudgets(
  rollups: readonly CostControlTradeRollup[],
  source: TradeBudgetSource,
): CostControlTradeRollup[] {
  if (!source.canReadBudget) {
    return rollups.map((rollup) => ({
      ...rollup,
      originalBudget: unavailableMetric(),
      approvedBudget: unavailableMetric(),
    }));
  }

  const owners = workPackageOwners(rollups);
  const slices = uniqueCostCodeAmounts(source.approvedCostCodeAmounts);
  const approvedCounts = countCostCodes(source.approvedLines);

  return rollups.map((rollup) => ({
    ...rollup,
    originalBudget: budgetMetricForGroup(
      rollup,
      source.originalLines,
      owners,
      source.currency,
      null,
      new Map(),
    ),
    approvedBudget: budgetMetricForGroup(
      rollup,
      source.approvedLines,
      owners,
      source.currency,
      slices,
      approvedCounts,
    ),
  }));
}

export function labelTradeRollupWorkPackages(
  rollups: readonly CostControlTradeRollup[],
  options: readonly { readonly id: string; readonly name: string }[],
): CostControlTradeRollup[] {
  const names = new Map(options.map((option) => [option.id, option.name]));
  return rollups.map((rollup) => ({
    ...rollup,
    workPackages: rollup.workPackageIds.flatMap((id) => {
      const name = names.get(id);
      return name ? [{ id, name }] : [];
    }),
  }));
}

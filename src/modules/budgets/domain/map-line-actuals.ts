import type { ProjectExpenseContribution } from '@/modules/financials/domain/cost-aggregation';
import type { CostPosition } from '@/modules/financials/domain/types';
import type { ProjectProfitabilityMode } from '@/modules/tenancy/domain/project-profitability-mode';
import {
  addMoney,
  fromNumericString,
  roundMoney,
  subtractMoney,
  sumMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money/money';
import type { BudgetLineType, ProjectBudgetLineRecord } from './types';
import {
  composeBudgetControlPosition,
  moneyFromBudgetAmount,
  type BudgetControlPosition,
} from './variance';

/**
 * Per-line Budget vs Actual overlay.
 *
 * Actual is never recalculated here. Project Actual / commitment / ETC /
 * Forecast come from the shared engine `CostPosition`. Category and
 * work-package lines receive slices of already-loaded expense contributions
 * only when the mapping key is present on both the line and the contribution.
 * Discipline and cost-code keys are not carried by the expense/AP model, so
 * those lines stay unmapped - never guessed.
 *
 * Remaining commitment and project ETC (`expectedRemainingCost`) stay on the
 * engine total. A line's `etcAmount` is planning only: it is shown on that
 * line and is never added again on top of the project expected remaining cost.
 * The line's planning forecast is Actual + that line ETC when set; otherwise
 * it equals Actual. That planning figure is not the project Forecast.
 */
export type BudgetLineRowKind = 'budget_line' | 'unmapped_remainder';

export type BudgetLineMappingStatus =
  | 'engine_total'
  | 'mapped'
  | 'unmapped'
  | 'unmapped_remainder';

export interface BudgetLineControlMetrics {
  readonly budget: MoneyValue | null;
  readonly actual: MoneyValue | null;
  readonly remainingCommitment: MoneyValue | null;
  readonly etc: MoneyValue | null;
  readonly forecast: MoneyValue | null;
  readonly variance: MoneyValue | null;
}

export interface BudgetLineControlRow {
  readonly id: string;
  readonly kind: BudgetLineRowKind;
  readonly lineType: BudgetLineType | 'unmapped';
  readonly label: string;
  readonly mappingStatus: BudgetLineMappingStatus;
  readonly categoryKey: string | null;
  readonly workPackageId: string | null;
  readonly disciplineKey: string | null;
  readonly costCode: string | null;
  readonly metrics: BudgetLineControlMetrics;
}

export const UNMAPPED_REMAINDER_ROW_ID = '__unmapped_remainder';

export interface MapBudgetLineActualsInput {
  readonly currency: string;
  readonly lines: readonly ProjectBudgetLineRecord[];
  /** Engine cost - required for Actual. Null when financials are not readable. */
  readonly cost: CostPosition | null;
  /**
   * Expense contribution slices already loaded for this project.
   * `null` = slices were not loaded (no expenses permission) - do not treat
   * as mapped-to-zero. `[]` = loaded, nothing to map.
   *
   * Bill-linked expense deductions should be applied upstream before mapping.
   */
  readonly contributions: readonly ProjectExpenseContribution[] | null;
  /**
   * When workforce True Cost is in engine Actual, Mode B labor-category expenses
   * are excluded from Actual - exclude them from mapping too.
   */
  readonly excludeLaborCategory?: boolean;
  /** Passed through to the engine-total line so variance matches org profitability mode. */
  readonly mode?: ProjectProfitabilityMode;
}

export interface MapBudgetLineActualsResult {
  readonly rows: readonly BudgetLineControlRow[];
  readonly unmappedRemainder: MoneyValue;
}

function emptyMetrics(currency: string): BudgetLineControlMetrics {
  return {
    budget: zeroMoney(currency),
    actual: null,
    remainingCommitment: null,
    etc: null,
    forecast: null,
    variance: null,
  };
}

function controlToMetrics(control: BudgetControlPosition): BudgetLineControlMetrics {
  return {
    budget: control.budget,
    actual: control.actual,
    remainingCommitment: control.remainingCommitment,
    etc: control.etc,
    forecast: control.forecast,
    variance: control.variance,
  };
}

/**
 * Expense/AP rows carry `categoryKey`, `workPackageId`, and `costCodeId`.
 * Discipline lines have no actual source and remain unmapped.
 * Cost-code lines are mapped via `costCodeId` when both the budget line
 * and expense contributions carry the same catalog entry (0141).
 */
export function lineHasReliableActualMapping(line: ProjectBudgetLineRecord): boolean {
  if (line.lineType === 'total') return true;
  if (line.lineType === 'category') return Boolean(line.categoryKey);
  if (line.lineType === 'work_package') return Boolean(line.workPackageId);
  if (line.lineType === 'cost_code') return Boolean(line.costCodeId);
  if (line.lineType === 'discipline') return Boolean(line.disciplineKey);
  return false;
}

function contributionEligibleForMapping(
  contribution: ProjectExpenseContribution,
  currency: string,
  excludeLaborCategory: boolean,
): boolean {
  // Native-currency contributions are always eligible.
  // FX contributions are eligible only when a pre-computed ILS equivalent is recorded (0141).
  const nativeCurrency = contribution.currency.toUpperCase() === currency.toUpperCase();
  const hasFxEquivalent = Boolean(contribution.ilsEquivalentNetAmount);
  if (!nativeCurrency && !hasFxEquivalent) return false;
  if (excludeLaborCategory && contribution.isLaborCategory) return false;
  return true;
}

function contributionMatchesLine(
  contribution: ProjectExpenseContribution,
  line: ProjectBudgetLineRecord,
): boolean {
  if (line.lineType === 'category') {
    return Boolean(line.categoryKey) && contribution.categoryKey === line.categoryKey;
  }
  if (line.lineType === 'work_package') {
    return Boolean(line.workPackageId) && contribution.workPackageId === line.workPackageId;
  }
  if (line.lineType === 'cost_code') {
    // Both must carry the same cost-code catalog UUID (migration 0074 / 0141).
    return (
      Boolean(line.costCodeId) &&
      Boolean(contribution.costCodeId) &&
      contribution.costCodeId === line.costCodeId
    );
  }
  if (line.lineType === 'discipline') {
    return (
      Boolean(line.disciplineKey) &&
      Boolean(contribution.categoryKey) &&
      contribution.categoryKey === line.disciplineKey
    );
  }
  return false;
}

/**
 * Exclusive assignment: each eligible contribution maps to at most one line.
 * Priority: work_package > cost_code > category (most → least specific).
 *
 * FX contributions with `ilsEquivalentNetAmount` are eligible — their ILS
 * equivalent is used as the mapped amount rather than the foreign-currency amount.
 */
function assignMappedActuals(
  lines: readonly ProjectBudgetLineRecord[],
  contributions: readonly ProjectExpenseContribution[],
  currency: string,
  excludeLaborCategory: boolean,
): Map<string, MoneyValue> {
  const eligible = contributions.filter((contribution) =>
    contributionEligibleForMapping(contribution, currency, excludeLaborCategory),
  );
  const claimed = new Set<number>();
  const actualByLineId = new Map<string, MoneyValue>();

  /**
   * For a matched contribution, resolve the amount in the budget currency.
   * Native-currency: use `amount`. FX with ILS equivalent: use `ilsEquivalentNetAmount`.
   */
  const resolveAmount = (contribution: ProjectExpenseContribution): MoneyValue | null => {
    const isNative = contribution.currency.toUpperCase() === currency.toUpperCase();
    if (isNative) return fromNumericString(contribution.amount, currency);
    if (contribution.ilsEquivalentNetAmount) {
      return fromNumericString(contribution.ilsEquivalentNetAmount, currency);
    }
    return null;
  };

  const take = (line: ProjectBudgetLineRecord): MoneyValue => {
    const values: MoneyValue[] = [];
    eligible.forEach((contribution, index) => {
      if (claimed.has(index)) return;
      if (!contributionMatchesLine(contribution, line)) return;
      claimed.add(index);
      const amount = resolveAmount(contribution);
      if (amount) values.push(amount);
    });
    return values.length === 0 ? zeroMoney(currency) : roundMoney(sumMoney(values, currency));
  };

  // Pass 1 – work_package (most specific)
  for (const line of lines) {
    if (line.lineType === 'work_package' && line.workPackageId) {
      actualByLineId.set(line.id, take(line));
    }
  }
  // Pass 2 – cost_code (more specific than category, less than WP)
  for (const line of lines) {
    if (line.lineType === 'cost_code' && line.costCodeId) {
      actualByLineId.set(line.id, take(line));
    }
  }
  // Pass 3 – discipline (categoryKey aligned with disciplineKey on budget line)
  for (const line of lines) {
    if (line.lineType === 'discipline' && line.disciplineKey) {
      actualByLineId.set(line.id, take(line));
    }
  }
  // Pass 4 – category (least specific)
  for (const line of lines) {
    if (line.lineType === 'category' && line.categoryKey) {
      actualByLineId.set(line.id, take(line));
    }
  }
  return actualByLineId;
}

function mappedDetailMetrics(
  line: ProjectBudgetLineRecord,
  actual: MoneyValue,
  currency: string,
): BudgetLineControlMetrics {
  const budget = moneyFromBudgetAmount(line.budgetAmount, currency);
  const etc = line.etcAmount != null ? moneyFromBudgetAmount(line.etcAmount, currency) : null;
  // Planning forecast for this line only. Not folded into project expectedRemainingCost.
  const forecast = etc ? roundMoney(addMoney(actual, etc)) : actual;
  return {
    budget,
    actual,
    remainingCommitment: null,
    etc,
    forecast,
    variance: subtractMoney(budget, forecast),
  };
}

function unmappedDetailMetrics(
  line: ProjectBudgetLineRecord,
  currency: string,
): BudgetLineControlMetrics {
  const budget = moneyFromBudgetAmount(line.budgetAmount, currency);
  const etc = line.etcAmount != null ? moneyFromBudgetAmount(line.etcAmount, currency) : null;
  return {
    budget,
    actual: null,
    remainingCommitment: null,
    etc,
    forecast: null,
    variance: null,
  };
}

function totalLineMetrics(
  line: ProjectBudgetLineRecord,
  currency: string,
  cost: CostPosition | null,
  mode?: ProjectProfitabilityMode,
): BudgetLineControlMetrics {
  if (!cost) {
    return {
      ...emptyMetrics(currency),
      budget: moneyFromBudgetAmount(line.budgetAmount, currency),
    };
  }
  return controlToMetrics(
    composeBudgetControlPosition({
      budgetAmount: line.budgetAmount,
      currency,
      cost,
      mode,
    }),
  );
}

function toLineRow(
  line: ProjectBudgetLineRecord,
  metrics: BudgetLineControlMetrics,
  mappingStatus: BudgetLineMappingStatus,
): BudgetLineControlRow {
  return {
    id: line.id,
    kind: 'budget_line',
    lineType: line.lineType,
    label: line.label,
    mappingStatus,
    categoryKey: line.categoryKey,
    workPackageId: line.workPackageId,
    disciplineKey: line.disciplineKey,
    costCode: line.costCode,
    metrics,
  };
}

function hasNonTotalLines(lines: readonly ProjectBudgetLineRecord[]): boolean {
  return lines.some((line) => line.lineType !== 'total');
}

/**
 * Map engine Actual onto budget lines when the key is reliable.
 * Always appends an Unmapped / unallocated row when non-total lines exist
 * and engine Actual is available - never drop the remainder.
 */
export function mapBudgetLineActuals(
  input: MapBudgetLineActualsInput,
): MapBudgetLineActualsResult {
  const currency = input.currency.toUpperCase();
  const zero = zeroMoney(currency);
  const rows: BudgetLineControlRow[] = [];
  let mappedLineActualSum = zero;
  const assigned =
    input.contributions === null
      ? null
      : assignMappedActuals(
          input.lines,
          input.contributions,
          currency,
          Boolean(input.excludeLaborCategory),
        );

  for (const line of input.lines) {
    if (line.lineType === 'total') {
      rows.push(toLineRow(line, totalLineMetrics(line, currency, input.cost, input.mode), 'engine_total'));
      continue;
    }

    const reliable = lineHasReliableActualMapping(line);
    const canSlice = reliable && assigned !== null;

    if (!canSlice) {
      rows.push(toLineRow(line, unmappedDetailMetrics(line, currency), 'unmapped'));
      continue;
    }

    const actual = assigned.get(line.id) ?? zeroMoney(currency);
    rows.push(toLineRow(line, mappedDetailMetrics(line, actual, currency), 'mapped'));
    mappedLineActualSum = addMoney(mappedLineActualSum, actual);
  }

  const engineActual = input.cost?.actualCostToDate ?? zero;
  const unmappedRemainder = input.cost
    ? subtractMoney(engineActual, mappedLineActualSum)
    : zero;

  if (input.cost && hasNonTotalLines(input.lines)) {
    rows.push({
      id: UNMAPPED_REMAINDER_ROW_ID,
      kind: 'unmapped_remainder',
      lineType: 'unmapped',
      label: '',
      mappingStatus: 'unmapped_remainder',
      categoryKey: null,
      workPackageId: null,
      disciplineKey: null,
      costCode: null,
      metrics: {
        budget: null,
        actual: unmappedRemainder,
        remainingCommitment: null,
        etc: null,
        forecast: null,
        variance: null,
      },
    });
  }

  return { rows, unmappedRemainder };
}

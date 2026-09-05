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
 * Remaining commitment and project ETC are not split across detail lines.
 * Forecast on a mapped detail line is Actual + that line's `etcAmount` when
 * set; otherwise Forecast = Actual.
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
 * Expense/AP rows carry `categoryKey` and `workPackageId` only.
 * Discipline and cost-code are budget-structure keys with no actual source.
 */
export function lineHasReliableActualMapping(line: ProjectBudgetLineRecord): boolean {
  if (line.lineType === 'total') return true;
  if (line.lineType === 'category') return Boolean(line.categoryKey);
  if (line.lineType === 'work_package') return Boolean(line.workPackageId);
  return false;
}

function contributionEligibleForMapping(
  contribution: ProjectExpenseContribution,
  currency: string,
  excludeLaborCategory: boolean,
): boolean {
  if (contribution.currency.toUpperCase() !== currency.toUpperCase()) return false;
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
  return false;
}

/**
 * Exclusive assignment: each eligible contribution maps to at most one line.
 * Work-package is more specific than category, so WP lines claim first.
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

  const take = (line: ProjectBudgetLineRecord): MoneyValue => {
    const values: MoneyValue[] = [];
    eligible.forEach((contribution, index) => {
      if (claimed.has(index)) return;
      if (!contributionMatchesLine(contribution, line)) return;
      claimed.add(index);
      const amount = fromNumericString(contribution.amount, contribution.currency);
      if (amount) values.push(amount);
    });
    return values.length === 0 ? zeroMoney(currency) : roundMoney(sumMoney(values, currency));
  };

  for (const line of lines) {
    if (line.lineType === 'work_package' && line.workPackageId) {
      actualByLineId.set(line.id, take(line));
    }
  }
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

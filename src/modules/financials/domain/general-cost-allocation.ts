/**
 * Automatic general business cost allocation by monthly Direct Actual weight.
 *
 * ALLOCATION BASIS (signed pools):
 * - Pool may be negative (credits/reversals); amounts scale with pool sign.
 * - Weights are always non-negative and deterministic (sorted by projectId).
 * - Weight driver: max(0, directActual) per project; original directActual is
 *   stored as directActualBasis for display/audit (may be negative).
 * - If sum(max(0, directActual)) > 0 → proportional weight on positive bases.
 * - Else if eligible projects exist → equal split (weight 1 each).
 * - Else → entire pool is unallocatable.
 * - Cent conservation: allocated + unallocatable = pool exactly (signed).
 * - weightPercent ∈ [0, 100] from weight share, never from signed amounts.
 * - Lines: non-zero amounts only (positive or negative); exact zeros dropped.
 *
 * DIRECT_ACTUAL is the basis — never includes auto-general allocations (no circular calc).
 */

import Decimal from 'decimal.js';
import {
  addMoney,
  money,
  moneyEquals,
  roundMoney,
  subtractMoney,
  sumMoney,
  toDecimalValue,
  toNumericString,
  type MoneyValue,
} from '@/shared/money';
import { DomainRuleError } from '@/shared/errors';

export type GeneralAllocationBasisMode =
  | 'direct_actual_weight'
  | 'equal_split'
  | 'none';

export interface ProjectDirectActualBasis {
  readonly projectId: string;
  readonly directActual: MoneyValue;
}

export interface GeneralPoolAllocationLine {
  readonly projectId: string;
  readonly directActualBasis: MoneyValue;
  readonly weightPercent: string;
  readonly amount: MoneyValue;
}

export interface GeneralPoolAllocationResult {
  readonly pool: MoneyValue;
  readonly allocated: MoneyValue;
  readonly unallocatable: MoneyValue;
  readonly basisMode: GeneralAllocationBasisMode;
  readonly lines: readonly GeneralPoolAllocationLine[];
}

interface WeightedProjectBasis {
  readonly projectId: string;
  readonly directActualBasis: MoneyValue;
  readonly weightBasis: MoneyValue;
}

function nonNegativeWeightBasis(directActual: MoneyValue): MoneyValue {
  const rounded = roundMoney(directActual);
  return toDecimalValue(rounded).isNegative() ? money('0', rounded.currency) : rounded;
}

/** Allocate GENERAL_POOL across projects (pool may be signed). */
export function allocateGeneralPoolByDirectActual(input: {
  readonly pool: MoneyValue;
  readonly projects: readonly ProjectDirectActualBasis[];
}): GeneralPoolAllocationResult {
  const pool = roundMoney(input.pool);
  const currency = pool.currency;

  if (toDecimalValue(pool).isZero()) {
    return {
      pool,
      allocated: money('0', currency),
      unallocatable: money('0', currency),
      basisMode: 'none',
      lines: [],
    };
  }

  const eligible = input.projects.filter(
    (p) => p.directActual.currency.toUpperCase() === currency.toUpperCase(),
  );

  if (eligible.length === 0) {
    return {
      pool,
      allocated: money('0', currency),
      unallocatable: pool,
      basisMode: 'none',
      lines: [],
    };
  }

  const weightedRows: WeightedProjectBasis[] = eligible.map((p) => ({
    projectId: p.projectId,
    directActualBasis: roundMoney(p.directActual),
    weightBasis: nonNegativeWeightBasis(p.directActual),
  }));

  const positiveWeightSum = roundMoney(
    sumMoney(
      weightedRows.map((row) => row.weightBasis),
      currency,
    ),
  );

  if (toDecimalValue(positiveWeightSum).greaterThan(0)) {
    return allocateByWeights(pool, weightedRows, 'direct_actual_weight');
  }

  const equalRows: WeightedProjectBasis[] = eligible.map((p) => ({
    projectId: p.projectId,
    directActualBasis: roundMoney(p.directActual),
    weightBasis: money('1', currency),
  }));
  return allocateByWeights(pool, equalRows, 'equal_split');
}

function allocateByWeights(
  pool: MoneyValue,
  projects: readonly WeightedProjectBasis[],
  basisMode: 'direct_actual_weight' | 'equal_split',
): GeneralPoolAllocationResult {
  const currency = pool.currency;
  const sorted = [...projects].sort((a, b) => a.projectId.localeCompare(b.projectId));
  const totalBasis = sorted.reduce(
    (sum, row) => sum.plus(toDecimalValue(row.weightBasis)),
    new Decimal(0),
  );

  if (totalBasis.isZero()) {
    return {
      pool,
      allocated: money('0', currency),
      unallocatable: pool,
      basisMode: 'none',
      lines: [],
    };
  }

  const amounts: MoneyValue[] = sorted.map((row) => {
    const raw = toDecimalValue(pool).times(toDecimalValue(row.weightBasis)).dividedBy(totalBasis);
    return roundMoney(money(raw.toFixed(6), currency));
  });

  const allocatedSum = sumMoney(amounts, currency);
  if (!moneyEquals(allocatedSum, pool)) {
    const residue = subtractMoney(pool, allocatedSum);
    amounts[amounts.length - 1] = addMoney(amounts[amounts.length - 1]!, residue);
  }

  const lines: GeneralPoolAllocationLine[] = sorted
    .map((row, index) => {
      const amount = roundMoney(amounts[index]!);
      const weightShare = toDecimalValue(row.weightBasis).times(100).dividedBy(totalBasis);
      const clampedWeight = Decimal.max(0, Decimal.min(100, weightShare));
      return {
        projectId: row.projectId,
        directActualBasis: row.directActualBasis,
        weightPercent: clampedWeight.toFixed(4),
        amount,
      };
    })
    .filter((line) => !toDecimalValue(line.amount).isZero());

  const allocated = roundMoney(sumMoney(lines.map((l) => l.amount), currency));
  const unallocatable = roundMoney(subtractMoney(pool, allocated));
  return {
    pool,
    allocated,
    unallocatable,
    basisMode,
    lines,
  };
}

export function assertGeneralPoolConserves(result: GeneralPoolAllocationResult): void {
  const sum = addMoney(result.allocated, result.unallocatable);
  if (toNumericString(roundMoney(sum)) !== toNumericString(roundMoney(result.pool))) {
    throw new DomainRuleError(
      `General pool does not conserve: allocated+unallocatable != pool`,
      'financials.errors.generalPoolConservation',
    );
  }

  const linesSum = roundMoney(sumMoney(result.lines.map((l) => l.amount), result.pool.currency));
  if (toNumericString(linesSum) !== toNumericString(roundMoney(result.allocated))) {
    throw new DomainRuleError(
      `General pool lines do not sum to allocated`,
      'financials.errors.generalPoolConservation',
    );
  }

  for (const line of result.lines) {
    const weight = new Decimal(line.weightPercent);
    if (weight.isNegative() || weight.greaterThan(100)) {
      throw new DomainRuleError(
        `General pool weight out of range: ${line.weightPercent}`,
        'financials.errors.generalPoolConservation',
      );
    }
  }
}

export function fullProjectActual(input: {
  readonly directActual: MoneyValue;
  readonly allocatedGeneral: MoneyValue;
}): MoneyValue {
  if (input.directActual.currency.toUpperCase() !== input.allocatedGeneral.currency.toUpperCase()) {
    throw new DomainRuleError('Currency mismatch', 'financials.errors.currencyMismatch');
  }
  return roundMoney(addMoney(input.directActual, input.allocatedGeneral));
}

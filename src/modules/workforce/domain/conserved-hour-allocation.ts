/**
 * Conserved allocation of a known cost pool across hour-weighted buckets.
 * Used for monthly project/non-project splits and daily multi-target days.
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
  type MoneyValue,
} from '@/shared/money';
import { DomainRuleError } from '@/shared/errors';

export const NON_PROJECT_COST_BUCKET = '__non_project__' as const;

export interface HourCostBucket {
  /** Project id, or NON_PROJECT_COST_BUCKET for company/non-project share. */
  readonly key: string;
  readonly hours: string;
}

export interface AllocatedHourCostBucket {
  readonly key: string;
  readonly hours: string;
  readonly amount: MoneyValue;
  readonly percent: string;
}

export interface ConservedHourAllocation {
  readonly buckets: readonly AllocatedHourCostBucket[];
  /** Project-only amounts (excludes non-project bucket). */
  readonly projectLines: readonly AllocatedHourCostBucket[];
  readonly allocatedToProjects: MoneyValue;
  readonly nonProjectOrUnallocated: MoneyValue;
  readonly knownAmount: MoneyValue;
}

function parseHours(value: string, label: string): Decimal {
  const trimmed = value.trim();
  if (!trimmed || !/^[+]?\d+(\.\d+)?$/.test(trimmed)) {
    throw new DomainRuleError(`Invalid ${label}`, 'workforce.errors.allocationBasisInvalid');
  }
  const parsed = new Decimal(trimmed);
  if (!parsed.isFinite() || parsed.isNegative()) {
    throw new DomainRuleError(`Invalid ${label}`, 'workforce.errors.allocationBasisInvalid');
  }
  return parsed;
}

/**
 * Distribute knownAmount across hour buckets with exact conservation:
 * Σ amounts = knownAmount.
 * Empty / zero total hours → 100% non-project/unallocated (admin / no work).
 */
export function allocateConservedAmountByHours(input: {
  readonly knownAmount: MoneyValue;
  readonly buckets: readonly HourCostBucket[];
}): ConservedHourAllocation {
  const { knownAmount } = input;
  const currency = knownAmount.currency;

  const normalized = input.buckets
    .map((bucket) => ({
      key: bucket.key,
      hours: parseHours(bucket.hours, 'hours'),
    }))
    .filter((bucket) => bucket.hours.greaterThan(0));

  const totalHours = normalized.reduce((sum, row) => sum.plus(row.hours), new Decimal(0));

  if (totalHours.isZero()) {
    return {
      buckets: [],
      projectLines: [],
      allocatedToProjects: money('0', currency),
      nonProjectOrUnallocated: knownAmount,
      knownAmount,
    };
  }

  const sorted = normalized.slice().sort((a, b) => a.key.localeCompare(b.key));
  const amounts: MoneyValue[] = sorted.map((row) => {
    const raw = toDecimalValue(knownAmount).times(row.hours).dividedBy(totalHours);
    return roundMoney(money(raw.toFixed(6), currency));
  });

  const total = sumMoney(amounts, currency);
  if (!moneyEquals(total, knownAmount)) {
    const residue = subtractMoney(knownAmount, total);
    const last = amounts.length - 1;
    amounts[last] = addMoney(amounts[last]!, residue);
  }

  const buckets: AllocatedHourCostBucket[] = sorted.map((row, index) => {
    const amount = amounts[index]!;
    const percent = toDecimalValue(knownAmount).isZero()
      ? '0'
      : toDecimalValue(amount).times(100).dividedBy(toDecimalValue(knownAmount)).toFixed(4);
    return {
      key: row.key,
      hours: row.hours.toFixed(6),
      amount,
      percent,
    };
  });

  const projectLines = buckets.filter((b) => b.key !== NON_PROJECT_COST_BUCKET);
  const nonProject = buckets.find((b) => b.key === NON_PROJECT_COST_BUCKET);
  const allocatedToProjects = sumMoney(
    projectLines.map((l) => l.amount),
    currency,
  );
  const nonProjectOrUnallocated = nonProject
    ? nonProject.amount
    : subtractMoney(knownAmount, allocatedToProjects);

  return {
    buckets,
    projectLines,
    allocatedToProjects,
    nonProjectOrUnallocated,
    knownAmount,
  };
}

import { revisedLineValue } from '@/modules/subcontracts/domain/value';
import { DomainRuleError } from '@/shared/errors';
import {
  addMoney,
  compareMoney,
  isNegativeMoney,
  money,
  subtractMoney,
  sumMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { ClaimLineFiguresView, ClaimTotalsView } from './types';

/**
 * Per-line claim arithmetic. All values are NET (VAT exists only on the AP bill).
 *
 *   revised value      = contract baseline + approved changes (Track E ledger)
 *   cumulative X       = prior certified cumulative + current X
 *   remaining          = revised value - cumulative certified (or - prior certified before certification)
 *
 * Ceiling: no cumulative (submitted or certified) may exceed the revised value of the line.
 */

export interface LineContractValue {
  readonly contractBaseline: MoneyValue;
  readonly approvedChanges: MoneyValue;
  readonly revised: MoneyValue;
}

export interface ContractBasisRow {
  readonly isBaseline: boolean;
  readonly contractAmount: string;
  readonly quantity: string;
  readonly adjustmentAmount: string;
  readonly adjustmentQuantity: string;
}

/** Contract value of a work line from the Track E inputs (stored price + approved adjustments). */
export function lineContractValue(row: ContractBasisRow, currency: string): LineContractValue {
  const value = revisedLineValue({
    currency,
    isBaseline: row.isBaseline,
    baselineAmount: row.contractAmount,
    baselineQuantity: row.quantity,
    adjustments: [{ quantityDelta: row.adjustmentQuantity, amountDelta: row.adjustmentAmount }],
  });
  return { contractBaseline: value.contractBaseline, approvedChanges: value.approvedChanges, revised: value.revised };
}

export function assertWithinCeiling(input: {
  readonly revised: MoneyValue;
  readonly priorCertified: MoneyValue;
  readonly current: MoneyValue;
  readonly kind: 'submitted' | 'certified';
  readonly lineLabel: string;
}): void {
  const cumulative = addMoney(input.priorCertified, input.current);
  if (isNegativeMoney(cumulative)) {
    throw new DomainRuleError(
      'Cumulative amount cannot be negative',
      'subcontractClaims.errors.negativeCumulative',
      { line: input.lineLabel },
    );
  }
  if (compareMoney(cumulative, input.revised) > 0) {
    throw new DomainRuleError(
      `Cumulative ${input.kind} exceeds the revised line value`,
      input.kind === 'submitted'
        ? 'subcontractClaims.errors.submittedExceedsRevised'
        : 'subcontractClaims.errors.certifiedExceedsRevised',
      { line: input.lineLabel, revised: input.revised.amount, cumulative: cumulative.amount },
    );
  }
}

/** A certifier may certify less than claimed, never more. */
export function assertCertifiedNotAboveSubmitted(input: {
  readonly submitted: MoneyValue;
  readonly certified: MoneyValue;
  readonly lineLabel: string;
}): void {
  if (isNegativeMoney(input.certified)) {
    throw new DomainRuleError('Certified amount cannot be negative', 'subcontractClaims.errors.negativeCertified', {
      line: input.lineLabel,
    });
  }
  if (compareMoney(input.certified, input.submitted) > 0) {
    throw new DomainRuleError(
      'Certified amount exceeds the submitted amount',
      'subcontractClaims.errors.certifiedExceedsSubmitted',
      { line: input.lineLabel },
    );
  }
}

export interface LineFiguresInput {
  readonly value: LineContractValue;
  readonly priorCertified: MoneyValue;
  readonly currentSubmitted: MoneyValue;
  /** null while the line has no certification decision. */
  readonly currentCertified: MoneyValue | null;
}

export interface LineFigures {
  readonly contractBaseline: MoneyValue;
  readonly approvedChanges: MoneyValue;
  readonly revisedValue: MoneyValue;
  readonly priorCertified: MoneyValue;
  readonly currentSubmitted: MoneyValue;
  readonly cumulativeSubmitted: MoneyValue;
  readonly currentCertified: MoneyValue | null;
  readonly cumulativeCertified: MoneyValue;
  readonly remaining: MoneyValue;
}

export function computeLineFigures(input: LineFiguresInput): LineFigures {
  const cumulativeCertified = input.currentCertified
    ? addMoney(input.priorCertified, input.currentCertified)
    : input.priorCertified;
  return {
    contractBaseline: input.value.contractBaseline,
    approvedChanges: input.value.approvedChanges,
    revisedValue: input.value.revised,
    priorCertified: input.priorCertified,
    currentSubmitted: input.currentSubmitted,
    cumulativeSubmitted: addMoney(input.priorCertified, input.currentSubmitted),
    currentCertified: input.currentCertified,
    cumulativeCertified,
    remaining: subtractMoney(input.value.revised, cumulativeCertified),
  };
}

export function lineFiguresView(figures: LineFigures): ClaimLineFiguresView {
  return {
    contractBaseline: figures.contractBaseline.amount,
    approvedChanges: figures.approvedChanges.amount,
    revisedValue: figures.revisedValue.amount,
    priorCertified: figures.priorCertified.amount,
    currentSubmitted: figures.currentSubmitted.amount,
    cumulativeSubmitted: figures.cumulativeSubmitted.amount,
    currentCertified: figures.currentCertified?.amount ?? null,
    cumulativeCertified: figures.cumulativeCertified.amount,
    remaining: figures.remaining.amount,
  };
}

export function sumFigures(figures: readonly LineFigures[], currency: string): ClaimTotalsView {
  const sum = (pick: (row: LineFigures) => MoneyValue) => sumMoney(figures.map(pick), currency).amount;
  const anyCertified = figures.some((row) => row.currentCertified !== null);
  return {
    revisedValue: sum((row) => row.revisedValue),
    priorCertified: sum((row) => row.priorCertified),
    currentSubmitted: sum((row) => row.currentSubmitted),
    cumulativeSubmitted: sum((row) => row.cumulativeSubmitted),
    currentCertified: anyCertified ? sum((row) => row.currentCertified ?? zeroMoney(currency)) : null,
    cumulativeCertified: sum((row) => row.cumulativeCertified),
    remaining: sum((row) => row.remaining),
  };
}

export function moneyOf(amount: string | number | null | undefined, currency: string): MoneyValue {
  if (amount === null || amount === undefined) return zeroMoney(currency);
  return money(typeof amount === 'number' ? amount.toFixed(6) : amount, currency);
}

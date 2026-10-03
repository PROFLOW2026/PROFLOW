/**
 * Contract value arithmetic (Track E). Pure; consumed by Track F (claims) and Track S (cost control).
 *
 * Current contract value = original + approved changes (append-only `subcontract_value_events`).
 * A pending/negotiating change is not an event and never moves the value.
 * Revised line value = contract baseline + approved line adjustments (append-only ledger).
 * All amounts are NET (VAT is applied only at the AP invoice).
 */

import Decimal from 'decimal.js';
import { DomainRuleError } from '@/shared/errors';
import {
  addMoney,
  isNegativeMoney,
  money,
  multiplyMoney,
  sumMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { SubcontractChangeType, SubcontractLineType } from './types';

export interface ContractValueEventInput {
  readonly kind: string;
  readonly amount: string;
  readonly currency: string;
}

export interface ApprovedContractValue {
  readonly original: MoneyValue;
  readonly approvedChanges: MoneyValue;
  readonly current: MoneyValue;
}

const CHANGE_EVENT_KINDS = new Set(['change_order', 'adjustment']);

/**
 * Original comes from the `original` value event once recorded (activation), otherwise from the
 * agreement's draft amount. Only `change_order` / `adjustment` events count as approved changes.
 */
export function approvedContractValue(input: {
  readonly currency: string;
  readonly draftOriginalAmount: string | null;
  readonly events: readonly ContractValueEventInput[];
}): ApprovedContractValue {
  const currency = input.currency.toUpperCase();
  const originalEvent = input.events.find((event) => event.kind === 'original');
  const original = originalEvent
    ? money(originalEvent.amount, currency)
    : money(input.draftOriginalAmount ?? '0', currency);
  const approvedChanges = sumMoney(
    input.events
      .filter((event) => CHANGE_EVENT_KINDS.has(event.kind))
      .map((event) => money(event.amount, currency)),
    currency,
  );
  return { original, approvedChanges, current: addMoney(original, approvedChanges) };
}

export interface LineAdjustmentInput {
  readonly quantityDelta: string;
  readonly amountDelta: string;
}

export interface RevisedLineValue {
  /** 0 for lines introduced by an approved change. */
  readonly contractBaseline: MoneyValue;
  readonly approvedChanges: MoneyValue;
  readonly revised: MoneyValue;
  readonly baselineQuantity: string;
  readonly revisedQuantity: string;
}

/**
 * `baselineAmount` / `baselineQuantity` are the stored line price amount and quantity. For lines
 * created by an approved change (`isBaseline = false`) the stored values are the change's own
 * contribution, so they are reported as approved changes, not as contract baseline.
 */
export function revisedLineValue(input: {
  readonly currency: string;
  readonly isBaseline: boolean;
  readonly baselineAmount: string;
  readonly baselineQuantity: string;
  readonly adjustments: readonly LineAdjustmentInput[];
}): RevisedLineValue {
  const currency = input.currency.toUpperCase();
  const stored = money(input.baselineAmount, currency);
  const adjustmentTotal = sumMoney(
    input.adjustments.map((adjustment) => money(adjustment.amountDelta, currency)),
    currency,
  );
  const contractBaseline = input.isBaseline ? stored : zeroMoney(currency);
  const approvedChanges = input.isBaseline ? adjustmentTotal : addMoney(stored, adjustmentTotal);
  const quantity = input.adjustments.reduce(
    (acc, adjustment) => acc.plus(new Decimal(adjustment.quantityDelta)),
    new Decimal(input.baselineQuantity),
  );
  return {
    contractBaseline,
    approvedChanges,
    revised: addMoney(contractBaseline, approvedChanges),
    baselineQuantity: input.isBaseline ? new Decimal(input.baselineQuantity).toFixed(6) : '0.000000',
    revisedQuantity: quantity.toFixed(6),
  };
}

/** Line contract amount: quantity x rate for quantity_rate lines, the entered amount otherwise. */
export function computeLineContractAmount(input: {
  readonly currency: string;
  readonly lineType: SubcontractLineType;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly contractAmount?: string | null;
}): MoneyValue {
  const currency = input.currency.toUpperCase();
  if (input.lineType === 'quantity_rate') {
    return multiplyMoney(money(input.unitPrice, currency), input.quantity);
  }
  return money(input.contractAmount ?? '0', currency);
}

export function sumLineAmounts(amounts: readonly string[], currency: string): MoneyValue {
  return sumMoney(
    amounts.map((amount) => money(amount, currency)),
    currency.toUpperCase(),
  );
}

/** Weighted-milestone lines must add up to exactly 100% before activation. */
export function assertWeightedLinesComplete(
  lines: readonly { readonly lineType: SubcontractLineType; readonly weightPercent: string | null }[],
): void {
  const weighted = lines.filter((line) => line.lineType === 'weighted_milestone');
  if (weighted.length === 0) return;
  const total = weighted.reduce((acc, line) => acc.plus(new Decimal(line.weightPercent ?? '0')), new Decimal(0));
  if (!total.equals(100)) {
    throw new DomainRuleError(
      'Weighted milestone lines must total 100%',
      'subcontracts.errors.weightsIncomplete',
      { total: total.toFixed(2) },
    );
  }
}

/** Additions never reduce value; deductions never increase it. Other types are free. */
export function assertChangeAmountSign(changeType: SubcontractChangeType, amount: MoneyValue): void {
  const negative = isNegativeMoney(amount);
  const positive = !negative && !new Decimal(amount.amount).isZero();
  if (changeType === 'addition' && negative) {
    throw new DomainRuleError('An addition cannot reduce the contract value', 'subcontracts.errors.additionNegative');
  }
  if (changeType === 'deduction' && positive) {
    throw new DomainRuleError('A deduction cannot increase the contract value', 'subcontracts.errors.deductionPositive');
  }
}

export interface VersionLineInput {
  readonly quantityDelta: string;
  readonly unitRate: string | null;
  readonly amountDelta: string | null;
}

/** A version line amount: explicit delta, or quantity delta x rate. */
export function versionLineAmount(line: VersionLineInput, currency: string): MoneyValue {
  if (line.amountDelta !== null && line.amountDelta.trim() !== '') return money(line.amountDelta, currency);
  if (line.unitRate !== null && line.unitRate.trim() !== '') {
    return multiplyMoney(money(line.unitRate, currency), line.quantityDelta);
  }
  return zeroMoney(currency);
}

/** Version total = sum of its lines when lines exist, otherwise the entered amount. */
export function versionTotal(input: {
  readonly currency: string;
  readonly amount: string | null;
  readonly lines: readonly VersionLineInput[];
}): MoneyValue {
  const currency = input.currency.toUpperCase();
  if (input.lines.length === 0) return money(input.amount ?? '0', currency);
  return sumMoney(
    input.lines.map((line) => versionLineAmount(line, currency)),
    currency,
  );
}

/** No line and no contract may be revised below zero. */
export function assertNotBelowZero(value: MoneyValue, messageKey = 'subcontracts.errors.belowZero'): void {
  if (isNegativeMoney(value)) {
    throw new DomainRuleError('Revised value cannot be negative', messageKey, { amount: value.amount });
  }
}

/** `YYYY-MM-DD` + days (UTC calendar arithmetic). */
export function addDaysToBusinessDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

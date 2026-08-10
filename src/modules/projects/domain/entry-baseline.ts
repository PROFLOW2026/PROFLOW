import {
  fromNumericString,
  isNegativeMoney,
  money,
  subtractMoney,
  toNumericString,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import { computeTaxAmountBreakdown } from '@/modules/tax/domain/amounts';
import type { ContractRecord } from './types';

type TaxResolved = Parameters<typeof computeTaxAmountBreakdown>[0]['resolved'];

/**
 * Mid-project entry baseline (Wave Lead Contract).
 *
 * DISPLAY_ORIGINAL_NET − OPENING_REDUCTION_NET = MANAGED_OPENING_NET
 *
 * Display / reduction are context + audit only. Profitability and CCV use
 * managed opening (contracts.original_* + value events kind=original).
 */

export interface EntryBaselineAmounts {
  readonly displayEntered: string;
  readonly displayNet: string;
  readonly displayTax: string;
  readonly displayGross: string;
  readonly reductionEntered: string;
  readonly reductionNet: string;
  readonly reductionTax: string;
  readonly reductionGross: string;
  readonly managedEntered: string;
  readonly managedNet: string;
  readonly managedTax: string;
  readonly managedGross: string;
  /** True when a non-zero opening reduction was applied. */
  readonly hasOpeningReduction: boolean;
}

export function normalizeOpeningReductionInput(
  raw: string | null | undefined,
): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (trimmed === '') return null;
  return trimmed;
}

export function isZeroOpeningReductionAmount(
  raw: string | null | undefined,
  currency: string,
): boolean {
  const normalized = normalizeOpeningReductionInput(raw);
  if (normalized === null) return true;
  try {
    return money(normalized, currency).amount === zeroMoney(currency).amount;
  } catch {
    return false;
  }
}

/**
 * MANAGED_OPENING_NET = DISPLAY_ORIGINAL_NET − OPENING_REDUCTION_NET
 */
export function computeManagedOpeningNet(
  displayOriginalNet: MoneyValue,
  openingReductionNet: MoneyValue,
): MoneyValue {
  return subtractMoney(displayOriginalNet, openingReductionNet);
}

export function hasStoredOpeningReduction(contract: ContractRecord): boolean {
  const net = contract.openingReductionNetAmount;
  if (!net) return false;
  const value = fromNumericString(net, contract.currency);
  if (!value) return false;
  return value.amount !== zeroMoney(contract.currency).amount;
}

/** Display-original entered amount for forms (falls back to managed entered). */
export function resolveDisplayOriginalEntered(contract: ContractRecord): string | null {
  return contract.displayOriginalEnteredAmount ?? contract.enteredValueAmount;
}

/** Display-original net for commercial context UI (never for profitability KPIs). */
export function resolveDisplayOriginalNet(contract: ContractRecord): MoneyValue | null {
  if (contract.displayOriginalNetAmount) {
    return fromNumericString(contract.displayOriginalNetAmount, contract.currency);
  }
  if (contract.originalValueAmount) {
    return fromNumericString(contract.originalValueAmount, contract.currency);
  }
  return null;
}

export function resolveOpeningReductionNet(contract: ContractRecord): MoneyValue | null {
  if (!contract.openingReductionNetAmount) return null;
  return fromNumericString(contract.openingReductionNetAmount, contract.currency);
}

/**
 * Pure breakdown used by upsert + live UX preview.
 * Same tax mode / resolved rule for display original and opening reduction.
 */
export function computeEntryBaselineAmounts(input: {
  readonly displayEnteredAmount: string;
  readonly openingReductionAmount?: string | null;
  readonly currency: string;
  readonly amountIncludesTax: boolean;
  readonly resolved: TaxResolved;
}): EntryBaselineAmounts {
  const currency = input.currency.toUpperCase();
  const displayBreakdown = computeTaxAmountBreakdown({
    enteredAmount: input.displayEnteredAmount,
    currency,
    amountIncludesTax: input.amountIncludesTax,
    resolved: input.resolved,
  });

  const reductionRaw = normalizeOpeningReductionInput(input.openingReductionAmount);
  const reductionIsZero = isZeroOpeningReductionAmount(reductionRaw, currency);

  if (reductionIsZero) {
    const entered = toNumericString(displayBreakdown.entered);
    const net = toNumericString(displayBreakdown.net);
    const tax = toNumericString(displayBreakdown.tax);
    const gross = toNumericString(displayBreakdown.gross);
    return {
      displayEntered: entered,
      displayNet: net,
      displayTax: tax,
      displayGross: gross,
      reductionEntered: toNumericString(zeroMoney(currency)),
      reductionNet: toNumericString(zeroMoney(currency)),
      reductionTax: toNumericString(zeroMoney(currency)),
      reductionGross: toNumericString(zeroMoney(currency)),
      managedEntered: entered,
      managedNet: net,
      managedTax: tax,
      managedGross: gross,
      hasOpeningReduction: false,
    };
  }

  const reductionBreakdown = computeTaxAmountBreakdown({
    enteredAmount: reductionRaw!,
    currency,
    amountIncludesTax: input.amountIncludesTax,
    resolved: input.resolved,
  });

  if (isNegativeMoney(reductionBreakdown.net)) {
    throw new Error('Opening reduction cannot be negative');
  }

  const managedNet = computeManagedOpeningNet(displayBreakdown.net, reductionBreakdown.net);
  if (isNegativeMoney(managedNet)) {
    throw new Error('Opening reduction cannot exceed the original contract amount');
  }

  const managedTax = subtractMoney(displayBreakdown.tax, reductionBreakdown.tax);
  const managedGross = subtractMoney(displayBreakdown.gross, reductionBreakdown.gross);
  const managedEntered = input.amountIncludesTax ? managedGross : managedNet;

  return {
    displayEntered: toNumericString(displayBreakdown.entered),
    displayNet: toNumericString(displayBreakdown.net),
    displayTax: toNumericString(displayBreakdown.tax),
    displayGross: toNumericString(displayBreakdown.gross),
    reductionEntered: toNumericString(reductionBreakdown.entered),
    reductionNet: toNumericString(reductionBreakdown.net),
    reductionTax: toNumericString(reductionBreakdown.tax),
    reductionGross: toNumericString(reductionBreakdown.gross),
    managedEntered: toNumericString(managedEntered),
    managedNet: toNumericString(managedNet),
    managedTax: toNumericString(managedTax),
    managedGross: toNumericString(managedGross),
    hasOpeningReduction: true,
  };
}

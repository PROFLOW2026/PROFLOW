import { addMoney, zeroMoney, type MoneyValue } from '@/shared/money';
import { computeCommercialPosition } from '@/modules/commercial/domain/contract-value';
import type { CommercialPosition } from './types';

function addOptionalMoney(
  left: MoneyValue | null | undefined,
  right: MoneyValue | null | undefined,
  currency: string,
): MoneyValue | null {
  if (!left && !right) return null;
  return addMoney(left ?? zeroMoney(currency), right ?? zeroMoney(currency));
}

/** Same-currency sum of commercial positions - not a second engine. */
export function addCommercialPositions(
  left: CommercialPosition,
  right: CommercialPosition,
): CommercialPosition {
  const currency = left.currentContractValue.currency;
  return {
    originalContractValue: addMoney(left.originalContractValue, right.originalContractValue),
    approvedAdditions: addMoney(left.approvedAdditions, right.approvedAdditions),
    approvedReductions: addMoney(left.approvedReductions, right.approvedReductions),
    currentContractValue: addMoney(left.currentContractValue, right.currentContractValue),
    pendingChanges: addMoney(left.pendingChanges, right.pendingChanges),
    displayOriginalContractValue: addOptionalMoney(
      left.displayOriginalContractValue,
      right.displayOriginalContractValue,
      currency,
    ),
    openingReductionValue: addOptionalMoney(
      left.openingReductionValue,
      right.openingReductionValue,
      currency,
    ),
  };
}

export function sumCommercialPositions(
  positions: readonly CommercialPosition[],
  currency: string,
): CommercialPosition {
  if (positions.length === 0) {
    return computeCommercialPosition({
      valueEvents: [],
      pendingChanges: [],
      currency,
      originalValueFallback: null,
    });
  }

  return positions.reduce((acc, position) => addCommercialPositions(acc, position));
}

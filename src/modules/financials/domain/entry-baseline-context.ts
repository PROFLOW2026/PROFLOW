import { fromNumericString, zeroMoney } from '@/shared/money';
import type { CommercialPosition } from './types';

/**
 * Attach display-original / opening-reduction context when a non-zero reduction
 * was stored. KPI math continues to use managed opening + value events only.
 */
export function attachEntryBaselineContext(
  position: CommercialPosition,
  contract: {
    readonly currency: string;
    readonly displayOriginalNetAmount?: string | null;
    readonly openingReductionNetAmount?: string | null;
  },
): CommercialPosition {
  const reduction = contract.openingReductionNetAmount
    ? fromNumericString(contract.openingReductionNetAmount, contract.currency)
    : null;
  const hasReduction =
    Boolean(reduction) && reduction!.amount !== zeroMoney(contract.currency).amount;

  if (!hasReduction) {
    return {
      ...position,
      displayOriginalContractValue: null,
      openingReductionValue: null,
    };
  }

  return {
    ...position,
    displayOriginalContractValue: contract.displayOriginalNetAmount
      ? fromNumericString(contract.displayOriginalNetAmount, contract.currency)
      : null,
    openingReductionValue: reduction,
  };
}

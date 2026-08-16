/**
 * Work-order billing composition (Wave 2).
 * Produces a single net amount for the existing AR engine - not a second billing system.
 * VAT is applied by billing.createBillingRecord, not here.
 */

import { DomainRuleError } from '@/shared/errors';
import {
  addMoney,
  compareMoney,
  fromNumericString,
  isNegativeMoney,
  money,
  multiplyMoney,
  subtractMoney,
  type MoneyValue,
} from '@/shared/money';

export interface WorkOrderBillingCompositionInput {
  readonly currency: string;
  readonly laborHours?: string | null;
  readonly laborRate?: string | null;
  readonly materialsAmount?: string | null;
  readonly callOutFee?: string | null;
  readonly additionalCharges?: string | null;
  readonly discountAmount?: string | null;
  readonly notes?: string | null;
}

export interface WorkOrderBillingComposition {
  readonly currency: string;
  readonly laborAmount: MoneyValue;
  readonly materialsAmount: MoneyValue;
  readonly callOutFee: MoneyValue;
  readonly additionalCharges: MoneyValue;
  readonly discountAmount: MoneyValue;
  readonly netAmount: MoneyValue;
  readonly notes: string | null;
}

function parseNonNegative(raw: string | null | undefined, currency: string): MoneyValue {
  if (!raw || raw.trim() === '') return money('0', currency);
  const parsed = fromNumericString(raw, currency);
  if (!parsed) {
    throw new DomainRuleError('Invalid money amount', 'service.billing.invalidAmount');
  }
  if (isNegativeMoney(parsed)) {
    throw new DomainRuleError(
      'Work order billing amounts must be non-negative',
      'service.billing.negativeAmount',
    );
  }
  return parsed;
}

export function composeWorkOrderBillingAmount(
  input: WorkOrderBillingCompositionInput,
): WorkOrderBillingComposition {
  const currency = input.currency.toUpperCase();
  const hours = parseNonNegative(input.laborHours, currency);
  const rate = parseNonNegative(input.laborRate, currency);
  const laborAmount = multiplyMoney(rate, hours.amount);

  const materialsAmount = parseNonNegative(input.materialsAmount, currency);
  const callOutFee = parseNonNegative(input.callOutFee, currency);
  const additionalCharges = parseNonNegative(input.additionalCharges, currency);
  const discountAmount = parseNonNegative(input.discountAmount, currency);

  const gross = addMoney(
    addMoney(addMoney(laborAmount, materialsAmount), callOutFee),
    additionalCharges,
  );
  if (compareMoney(discountAmount, gross) > 0) {
    throw new DomainRuleError(
      'Discount cannot exceed work order charges',
      'service.billing.discountExceeds',
    );
  }
  const netAmount = subtractMoney(gross, discountAmount);

  return {
    currency,
    laborAmount,
    materialsAmount,
    callOutFee,
    additionalCharges,
    discountAmount,
    netAmount,
    notes: input.notes?.trim() || null,
  };
}

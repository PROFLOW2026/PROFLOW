import { toIsoInstant } from '@/shared/dates';
import { money, subtractMoney, toDecimalValue, type MoneyValue } from '@/shared/money';
import type {
  BillingRecordBridgeRef,
  ReconciliationMetadata,
  ReconciliationStatus,
} from './types';

export interface ProviderAmountSnapshot {
  readonly net: MoneyValue;
  readonly vat: MoneyValue | null;
  readonly gross: MoneyValue;
}

export interface ReconciliationResult {
  readonly status: ReconciliationStatus;
  readonly metadata: ReconciliationMetadata;
}

const DEFAULT_TOLERANCE = '0.01';

function withinTolerance(expected: MoneyValue, actual: MoneyValue, tolerance: string): boolean {
  const delta = subtractMoney(actual, expected);
  return toDecimalValue(delta).abs().lte(toDecimalValue(money(tolerance, expected.currency)));
}

export function reconcileExternalAmounts(
  billing: BillingRecordBridgeRef,
  provider: ProviderAmountSnapshot | null,
  tolerance: string = DEFAULT_TOLERANCE,
): ReconciliationResult {
  const expectedNet = billing.subtotalAmount;
  const expectedVat = billing.taxAmount;
  const expectedGross = billing.totalAmount;
  const comparedAt = toIsoInstant(new Date());

  const baseMetadata: ReconciliationMetadata = {
    expectedNet: expectedNet.amount,
    expectedVat: expectedVat?.amount ?? null,
    expectedGross: expectedGross.amount,
    currency: expectedGross.currency,
    comparedAt,
    tolerance,
  };

  if (!provider) {
    return {
      status: 'not_available',
      metadata: baseMetadata,
    };
  }

  const metadata: ReconciliationMetadata = {
    ...baseMetadata,
    actualNet: provider.net.amount,
    actualVat: provider.vat?.amount ?? null,
    actualGross: provider.gross.amount,
  };

  const netOk = withinTolerance(expectedNet, provider.net, tolerance);
  const grossOk = withinTolerance(expectedGross, provider.gross, tolerance);
  const vatOk =
    expectedVat == null
      ? provider.vat == null || toDecimalValue(provider.vat).isZero()
      : provider.vat != null && withinTolerance(expectedVat, provider.vat, tolerance);

  return {
    status: netOk && grossOk && vatOk ? 'matched' : 'mismatch',
    metadata,
  };
}

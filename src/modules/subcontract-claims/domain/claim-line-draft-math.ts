import { money, subtractMoney, zeroMoney } from '@/shared/money';

/** Cumulative progress % of revised line value → this period's NET amount. */
export function currentAmountFromProgressPercent(input: {
  readonly revisedNet: string;
  readonly priorCertified: string;
  readonly progressPercent: string;
  readonly currency: string;
}): string {
  const revised = money(input.revisedNet, input.currency);
  const prior = money(input.priorCertified, input.currency);
  const pct = Number.parseFloat(input.progressPercent);
  if (!Number.isFinite(pct) || pct < 0) return zeroMoney(input.currency).amount;
  const cumulativeTarget = money((Number(revised.amount) * (pct / 100)).toFixed(6), input.currency);
  const current = subtractMoney(cumulativeTarget, prior);
  return current.amount;
}

/** Quantity-based lines: proportional share of revised value minus prior certified. */
export function currentAmountFromClaimQuantity(input: {
  readonly revisedNet: string;
  readonly contractQuantity: string;
  readonly priorCertified: string;
  readonly claimQuantity: string;
  readonly currency: string;
}): string {
  const contractQty = Number.parseFloat(input.contractQuantity);
  const claimQty = Number.parseFloat(input.claimQuantity);
  if (!Number.isFinite(contractQty) || contractQty <= 0 || !Number.isFinite(claimQty) || claimQty < 0) {
    return zeroMoney(input.currency).amount;
  }
  const revised = money(input.revisedNet, input.currency);
  const prior = money(input.priorCertified, input.currency);
  const cumulativeTarget = money(
    ((Number(revised.amount) * claimQty) / contractQty).toFixed(6),
    input.currency,
  );
  const current = subtractMoney(cumulativeTarget, prior);
  return current.amount;
}

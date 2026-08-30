import type { MoneyValue } from '@/shared/money';

export interface ProjectAllocatedGeneralMonthSlice {
  readonly yearMonth: string;
  readonly allocatedAmount: MoneyValue;
  readonly poolWeightPercent: string | null;
}

export function formatPoolWeightPercent(raw: string | null | undefined): string | null {
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return value.toFixed(1);
}

export function informationalExpenseSharePercent(
  allocated: MoneyValue,
  expenseGross: MoneyValue | null,
): string | null {
  if (!expenseGross || Number(expenseGross.amount) === 0) return null;
  const pct = (Number(allocated.amount) / Number(expenseGross.amount)) * 100;
  if (!Number.isFinite(pct)) return null;
  return pct.toFixed(1);
}

export function showsCanonicalPoolWeight(allocationMethodKey: string | null): boolean {
  if (!allocationMethodKey) return true;
  return allocationMethodKey !== 'manual_amount';
}

export function uniformPoolWeight(
  slices: readonly { readonly poolWeightPercent: string | null }[],
): string | null {
  const formatted = slices
    .map((slice) => formatPoolWeightPercent(slice.poolWeightPercent))
    .filter((value): value is string => value != null);
  if (formatted.length === 0) return null;
  const first = formatted[0]!;
  return formatted.every((value) => value === first) ? first : null;
}

/** Count or money cell for execution / cost-control surfaces (Track S). */
export type MetricCount = { readonly kind: 'count'; readonly value: number } | { readonly kind: 'unavailable' };

export type MetricMoney = { readonly kind: 'money'; readonly amount: string; readonly currency: string } | { readonly kind: 'unavailable' };

export function countMetric(value: number | null | undefined): MetricCount {
  if (value === null || value === undefined) return { kind: 'unavailable' };
  return { kind: 'count', value: Math.max(0, value) };
}

export function moneyMetric(amount: string | null | undefined, currency: string | null | undefined): MetricMoney {
  if (!amount || !currency) return { kind: 'unavailable' };
  return { kind: 'money', amount, currency };
}

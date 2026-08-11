import { compareMoney, money, moneyEquals } from '@/shared/money';
import type { ApprovalEntityType, ApprovalRuleRecord, ApprovalStatus } from './types';

export function isApprovalEntityType(value: string): value is ApprovalEntityType {
  return (
    value === 'expense' ||
    value === 'vendor_bill' ||
    value === 'purchase_order' ||
    value === 'vendor_credit' ||
    value === 'time_correction' ||
    value === 'quote_discount' ||
    value === 'budget_revision'
  );
}

export function isApprovalStatus(value: string): value is ApprovalStatus {
  return (
    value === 'submitted' ||
    value === 'approved' ||
    value === 'rejected' ||
    value === 'cancelled'
  );
}

/**
 * A rule matches when enabled, entity type aligns, currency aligns (if set),
 * and amount is at/above threshold (null threshold = always match).
 */
export function ruleMatchesAmount(
  rule: ApprovalRuleRecord,
  input: {
    readonly entityType: ApprovalEntityType;
    readonly amount: string | null | undefined;
    readonly currency: string | null | undefined;
  },
): boolean {
  if (!rule.enabled) return false;
  if (rule.entityType !== input.entityType) return false;

  const amountCurrency = input.currency?.trim().toUpperCase() || null;
  const ruleCurrency = rule.currency?.trim().toUpperCase() || null;
  if (ruleCurrency && amountCurrency && ruleCurrency !== amountCurrency) return false;

  if (rule.thresholdAmount == null || rule.thresholdAmount === '') return true;
  if (input.amount == null || input.amount === '' || !amountCurrency) return false;
  if (ruleCurrency && ruleCurrency !== amountCurrency) return false;

  const currency = ruleCurrency ?? amountCurrency;
  return compareMoney(money(input.amount, currency), money(rule.thresholdAmount, currency)) >= 0;
}

/** Prefer the tightest (lowest) matching threshold; null thresholds sort last. */
export function selectMatchingRule(
  rules: readonly ApprovalRuleRecord[],
  input: {
    readonly entityType: ApprovalEntityType;
    readonly amount: string | null | undefined;
    readonly currency: string | null | undefined;
  },
): ApprovalRuleRecord | null {
  const matches = rules.filter((rule) => ruleMatchesAmount(rule, input));
  if (matches.length === 0) return null;

  const ranked = [...matches].sort((a, b) => {
    if (a.thresholdAmount == null && b.thresholdAmount == null) return 0;
    if (a.thresholdAmount == null) return 1;
    if (b.thresholdAmount == null) return -1;
    const currency =
      a.currency?.toUpperCase() ||
      b.currency?.toUpperCase() ||
      input.currency?.toUpperCase() ||
      'ILS';
    return compareMoney(money(a.thresholdAmount, currency), money(b.thresholdAmount, currency));
  });

  return ranked[0] ?? null;
}

export function approvalStatusShape(
  status: ApprovalStatus,
): 'pending' | 'approved' | 'rejected' | 'cancelled' {
  if (status === 'submitted') return 'pending';
  return status;
}

/**
 * An approved (or submitted) request only covers the current entity when
 * amount + currency still match. Null/empty on both sides covers amount-less
 * entities. A stored null amount does not authorize a later non-null amount.
 */
export function approvalCoversAmount(input: {
  readonly requestAmount: string | null;
  readonly requestCurrency: string | null;
  readonly currentAmount?: string | null;
  readonly currentCurrency?: string | null;
}): boolean {
  const current = input.currentAmount?.trim() || null;
  const currentCurrency = input.currentCurrency?.trim().toUpperCase() || null;
  const request = input.requestAmount?.trim() || null;
  const requestCurrency = input.requestCurrency?.trim().toUpperCase() || null;

  if (!current) return !request;
  if (!request || !requestCurrency || !currentCurrency) return false;
  if (requestCurrency !== currentCurrency) return false;
  return moneyEquals(money(request, requestCurrency), money(current, currentCurrency));
}

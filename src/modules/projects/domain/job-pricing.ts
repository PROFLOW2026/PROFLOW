import { subtractMoney, type MoneyValue } from '@/shared/money';
import type { PricingMode, WorkKind } from './types';

/** Canonical Hebrew copy for open-price jobs (wave lead contract). */
export const PRICE_NOT_SET_HE = 'המחיר טרם נקבע';

/** Message key under `jobs` namespace. */
export const PRICE_NOT_SET_MESSAGE_KEY = 'pricing.priceNotSet';

export interface WorkKindPricingFields {
  readonly workKind: WorkKind;
  readonly pricingMode: PricingMode | null;
}

/** Open-price job / work order: costs may accumulate; no revenue / margin basis yet. */
export function isOpenPriceJob(input: WorkKindPricingFields): boolean {
  return (
    (input.workKind === 'job' || input.workKind === 'work_order') && input.pricingMode === 'open'
  );
}

/**
 * Profit is defined only when there is a managed revenue basis.
 * Open-price jobs (or missing contract net) must not show a fake 0 margin.
 */
export function isJobProfitDefined(input: {
  readonly workKind: WorkKind;
  readonly pricingMode: PricingMode | null;
  readonly currentContractNet: MoneyValue | null | undefined;
}): boolean {
  if (
    (input.workKind === 'job' || input.workKind === 'work_order') &&
    input.pricingMode === 'open'
  ) {
    return false;
  }
  if (!input.currentContractNet) return false;
  return true;
}

/** Domain message key: convert blocked without managed revenue. */
export const CONVERT_REQUIRES_REVENUE_BASIS_MESSAGE_KEY =
  'jobs.convert.requiresRevenueBasis';

/**
 * Convert job → project only when a managed revenue basis already exists.
 * Open-price / missing contract must not flip to classic and invent 0 − cost loss.
 */
export function canConvertJobToProject(input: {
  readonly workKind: WorkKind;
  readonly pricingMode: PricingMode | null;
  readonly hasPrimaryContract: boolean;
  readonly hasManagedOriginalNet: boolean;
  readonly hasOriginalValueEvent: boolean;
}): boolean {
  if (input.workKind !== 'job') return false;
  if (input.pricingMode === 'open') return false;
  if (!input.hasPrimaryContract) return false;
  return input.hasManagedOriginalNet || input.hasOriginalValueEvent;
}

export type JobProfitDisplay =
  | { readonly kind: 'price_not_set' }
  | { readonly kind: 'defined'; readonly profit: MoneyValue };

/**
 * Job list / overview profit display helper.
 * Scenario C: fixed price − actual cost = margin when defined.
 */
export function resolveJobProfitDisplay(input: {
  readonly workKind: WorkKind;
  readonly pricingMode: PricingMode | null;
  readonly currentContractNet: MoneyValue | null | undefined;
  readonly actualCost: MoneyValue;
}): JobProfitDisplay {
  if (!isJobProfitDefined(input)) {
    return { kind: 'price_not_set' };
  }
  return {
    kind: 'defined',
    profit: subtractMoney(input.currentContractNet!, input.actualCost),
  };
}

/**
 * When list profit is unavailable: open-price jobs say “price not set”;
 * fixed/unknown missing profit uses an em dash (do not claim open-price).
 */
export function jobListMissingProfitKind(
  pricingMode: PricingMode | null | undefined,
): 'price_not_set' | 'dash' {
  return pricingMode === 'open' ? 'price_not_set' : 'dash';
}

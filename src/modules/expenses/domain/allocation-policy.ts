import { DomainRuleError } from '@/shared/errors';
import type { AllocationMethod, CostFamily, WeightAllocationMethod } from './types';
import { isWeightAllocationMethod, WEIGHT_ALLOCATION_METHODS } from './types';

/** Organization settings key for org-wide default driver (optional). */
export const ORG_ALLOCATION_DEFAULT_METHOD_KEY = 'allocation.default_method';

export type ExpenseCostClassification = 'DIRECT' | 'SHARED' | 'OVERHEAD';

export function classifyExpenseCost(costFamily: CostFamily, hasProjectId: boolean): ExpenseCostClassification {
  if (hasProjectId || costFamily === 'direct_project') return 'DIRECT';
  if (costFamily === 'shared') return 'SHARED';
  return 'OVERHEAD';
}

export function isAllocatableClassification(classification: ExpenseCostClassification): boolean {
  return classification === 'SHARED' || classification === 'OVERHEAD';
}

/**
 * Resolves which automatic (or manual) method to use.
 * Priority: explicit request → category default → org default → none.
 * `equal_split` is never inferred — it must appear explicitly on the request
 * or on a configured category/org policy.
 */
export function resolveAllocationMethodPolicy(input: {
  readonly explicitMethod?: AllocationMethod | null;
  readonly categoryDefaultMethod?: AllocationMethod | null;
  readonly organizationDefaultMethod?: AllocationMethod | null;
}): AllocationMethod | null {
  if (input.explicitMethod) return input.explicitMethod;
  if (input.categoryDefaultMethod) return input.categoryDefaultMethod;
  if (input.organizationDefaultMethod) return input.organizationDefaultMethod;
  return null;
}

export function assertEqualSplitIsExplicit(
  method: AllocationMethod,
  source: 'explicit' | 'category' | 'organization',
): void {
  if (method !== 'equal_split') return;
  // equal_split is allowed when chosen explicitly OR configured as policy —
  // both are "explicit" in the product sense (never silent fallback).
  if (source === 'explicit' || source === 'category' || source === 'organization') return;
  throw new DomainRuleError(
    'Equal_split allocation requires an explicit method selection',
    'expenses.errors.equalSplitRequiresExplicit',
  );
}

export function resolveMethodSource(input: {
  readonly explicitMethod?: AllocationMethod | null;
  readonly categoryDefaultMethod?: AllocationMethod | null;
  readonly organizationDefaultMethod?: AllocationMethod | null;
}): 'explicit' | 'category' | 'organization' | null {
  if (input.explicitMethod) return 'explicit';
  if (input.categoryDefaultMethod) return 'category';
  if (input.organizationDefaultMethod) return 'organization';
  return null;
}

export function parseAllocationMethodSetting(value: unknown): AllocationMethod | null {
  if (typeof value === 'string') {
    const known: AllocationMethod[] = [
      'manual_amount',
      'manual_percent',
      ...WEIGHT_ALLOCATION_METHODS,
    ];
    return known.includes(value as AllocationMethod) ? (value as AllocationMethod) : null;
  }
  if (value && typeof value === 'object' && 'method' in value) {
    return parseAllocationMethodSetting((value as { method: unknown }).method);
  }
  return null;
}

export function requireWeightMethod(method: AllocationMethod): WeightAllocationMethod {
  if (!isWeightAllocationMethod(method)) {
    throw new DomainRuleError(
      `Allocation method ${method} is not a weight driver`,
      'expenses.errors.allocationMethodNotWeight',
    );
  }
  return method;
}

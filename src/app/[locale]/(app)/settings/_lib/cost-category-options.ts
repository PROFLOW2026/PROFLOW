import type {
  AllocationMethod,
  CategoryPeriodBehavior,
  CostFamily,
} from '@/modules/expenses/domain/types';
import { CATEGORY_PERIOD_BEHAVIORS } from '@/modules/expenses/domain/types';

/**
 * Client-safe settings option lists + row shape.
 * Keep drizzle / DB helpers out of this module so panels do not pull schema into the browser.
 */
export interface CostCategoryRow {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly family: CostFamily;
  readonly isSystem: boolean;
  readonly sortOrder: number;
  readonly archivedAt: Date | null;
  readonly defaultAllocationMethod: AllocationMethod | null;
  readonly defaultPeriodBehavior: CategoryPeriodBehavior | null;
}

export const COST_FAMILIES: readonly CostFamily[] = [
  'direct_project',
  'shared',
  'business_overhead',
  'asset_capital',
];

export const ALLOCATION_METHODS: readonly AllocationMethod[] = [
  'manual_amount',
  'manual_percent',
  'contract_weight',
  'labor_hours_weight',
  'direct_cost_weight',
  'equal_split',
];

export const PERIOD_BEHAVIORS: readonly CategoryPeriodBehavior[] = CATEGORY_PERIOD_BEHAVIORS;

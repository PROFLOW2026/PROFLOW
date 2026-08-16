import { describe, expect, it } from 'vitest';
import { scheduleModeFromCategoryPeriodBehavior } from '@/modules/expenses/domain/allocation-schedule';
import { resolveAllocationMethodPolicy } from '@/modules/expenses/domain/allocation-policy';
import { CATEGORY_PERIOD_BEHAVIORS } from '@/modules/expenses/domain/types';

describe('cost category allocation policy', () => {
  it('exposes configurable period behaviors without hardcoded category keys', () => {
    expect(CATEGORY_PERIOD_BEHAVIORS).toEqual(['one_time', 'monthly', 'date_range']);
  });

  it('maps category period behavior to allocation schedule mode', () => {
    expect(scheduleModeFromCategoryPeriodBehavior('one_time')).toBe('one_time');
    expect(scheduleModeFromCategoryPeriodBehavior('monthly')).toBe('monthly');
    expect(scheduleModeFromCategoryPeriodBehavior('date_range')).toBe('custom');
    expect(scheduleModeFromCategoryPeriodBehavior(null)).toBeNull();
  });

  it('resolves method from category policy, never from category key examples', () => {
    // insurance (or any key) is not consulted - only the configured default method.
    const method = resolveAllocationMethodPolicy({
      explicitMethod: null,
      categoryDefaultMethod: 'labor_hours_weight',
      organizationDefaultMethod: 'contract_weight',
    });
    expect(method).toBe('labor_hours_weight');

    const overridden = resolveAllocationMethodPolicy({
      explicitMethod: 'equal_split',
      categoryDefaultMethod: 'contract_weight',
      organizationDefaultMethod: null,
    });
    expect(overridden).toBe('equal_split');
  });
});

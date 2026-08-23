import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import { assertBoqNodeNotOnBillingPlan } from '@/modules/boq/domain/lifecycle';

describe('BOQ progress billing vs billing plan (R-017)', () => {
  it('allows progress billing when node is not on active billing plan', () => {
    expect(() => assertBoqNodeNotOnBillingPlan(false)).not.toThrow();
  });

  it('blocks when node is linked on active billing plan', () => {
    try {
      assertBoqNodeNotOnBillingPlan(true);
      expect.fail('expected DomainRuleError');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainRuleError);
      expect((error as DomainRuleError).messageKey).toBe('boq.errors.boqOnBillingPlan');
    }
  });
});

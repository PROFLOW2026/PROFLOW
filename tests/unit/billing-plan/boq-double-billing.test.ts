import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import { assertBoqNodeNotAlreadyBilled } from '@/modules/billing-plan/domain/lifecycle';

describe('billing-plan BOQ double-billing guard', () => {
  it('allows issue when the BOQ node has no progress billing claim/link', () => {
    expect(() => assertBoqNodeNotAlreadyBilled(false)).not.toThrow();
  });

  it('rejects with billingPlan.errors.boqAlreadyBilled when already billed', () => {
    try {
      assertBoqNodeNotAlreadyBilled(true);
      expect.fail('expected DomainRuleError');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainRuleError);
      expect((error as DomainRuleError).messageKey).toBe('billingPlan.errors.boqAlreadyBilled');
    }
  });
});

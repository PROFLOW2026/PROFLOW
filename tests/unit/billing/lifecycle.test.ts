import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertPaymentTarget,
  assertVoidable,
} from '@/modules/billing/domain/lifecycle';

describe('billing record lifecycle', () => {
  it('blocks voiding a finalized record that still has recorded payments', () => {
    expect(() =>
      assertVoidable('finalized', null, [{ status: 'recorded' }, { status: 'void' }]),
    ).toThrow(DomainRuleError);
  });

  it('allows voiding when only void payments remain', () => {
    expect(() => assertVoidable('finalized', null, [{ status: 'void' }])).not.toThrow();
  });

  it('blocks payments against credit notes (Payment ≠ Credit)', () => {
    expect(() => assertPaymentTarget('finalized', 'credit_note')).toThrow(DomainRuleError);
    expect(() => assertPaymentTarget('finalized', 'invoice')).not.toThrow();
    expect(() => assertPaymentTarget('finalized', 'advance')).not.toThrow();
  });

  it('still requires finalized status for payment targets', () => {
    expect(() => assertPaymentTarget('draft', 'invoice')).toThrow(DomainRuleError);
    expect(() => assertPaymentTarget('void', 'invoice')).toThrow(DomainRuleError);
  });
});

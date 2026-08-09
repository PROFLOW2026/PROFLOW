import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import { assertVoidable } from '@/modules/billing/domain/lifecycle';

describe('billing record lifecycle', () => {
  it('blocks voiding a finalized record that still has recorded payments', () => {
    expect(() =>
      assertVoidable('finalized', null, [{ status: 'recorded' }, { status: 'void' }]),
    ).toThrow(DomainRuleError);
  });

  it('allows voiding when only void payments remain', () => {
    expect(() => assertVoidable('finalized', null, [{ status: 'void' }])).not.toThrow();
  });
});

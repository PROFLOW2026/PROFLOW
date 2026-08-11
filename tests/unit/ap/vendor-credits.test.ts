import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertCreditDraftEditable,
  assertCreditNotSilentlyEditable,
  assertCreditVoidable,
  displayCreditLifecycleStatus,
} from '@/modules/ap';

describe('vendor credit lifecycle domain', () => {
  it('maps draft + submitted approval to pending approval', () => {
    expect(
      displayCreditLifecycleStatus({
        creditStatus: 'draft',
        approvalRequestStatus: 'submitted',
      }),
    ).toBe('pending_approval');
    expect(displayCreditLifecycleStatus({ creditStatus: 'draft' })).toBe('draft');
    expect(displayCreditLifecycleStatus({ creditStatus: 'open' })).toBe('open');
    expect(displayCreditLifecycleStatus({ creditStatus: 'applied' })).toBe('applied');
    expect(displayCreditLifecycleStatus({ creditStatus: 'void' })).toBe('void');
  });

  it('keeps list and detail on the same pending-approval display status', () => {
    expect(
      displayCreditLifecycleStatus({
        creditStatus: 'draft',
        approvalRequestStatus: 'submitted',
      }),
    ).toBe('pending_approval');
    expect(
      displayCreditLifecycleStatus({
        creditStatus: 'draft',
        approvalRequestStatus: 'approved',
      }),
    ).toBe('draft');
  });

  it('allows draft edits only', () => {
    expect(() => assertCreditDraftEditable('draft')).not.toThrow();
    expect(() => assertCreditDraftEditable('open')).toThrow(DomainRuleError);
    expect(() => assertCreditNotSilentlyEditable('open')).toThrow(DomainRuleError);
    expect(() => assertCreditNotSilentlyEditable('applied')).toThrow(DomainRuleError);
    expect(() => assertCreditNotSilentlyEditable('draft')).not.toThrow();
  });

  it('blocks void of an already void credit; allows open and applied', () => {
    expect(() => assertCreditVoidable({ creditStatus: 'open' })).not.toThrow();
    expect(() => assertCreditVoidable({ creditStatus: 'applied' })).not.toThrow();
    expect(() => assertCreditVoidable({ creditStatus: 'draft' })).not.toThrow();
    expect(() => assertCreditVoidable({ creditStatus: 'void' })).toThrow(DomainRuleError);
  });
});

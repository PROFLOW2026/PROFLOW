import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertSubcontractAcceptsValueChange,
  assertSubcontractStatusTransition,
  canTransitionSubcontractStatus,
} from '@/modules/vendors/domain/subcontract-lifecycle';

describe('subcontract status lifecycle', () => {
  it('allows draft → active → completed', () => {
    expect(canTransitionSubcontractStatus('draft', 'active')).toBe(true);
    expect(canTransitionSubcontractStatus('active', 'completed')).toBe(true);
    expect(() => assertSubcontractStatusTransition('draft', 'active')).not.toThrow();
  });

  it('allows cancel from draft or active only', () => {
    expect(canTransitionSubcontractStatus('draft', 'cancelled')).toBe(true);
    expect(canTransitionSubcontractStatus('active', 'cancelled')).toBe(true);
    expect(canTransitionSubcontractStatus('completed', 'cancelled')).toBe(false);
    expect(() => assertSubcontractStatusTransition('completed', 'active')).toThrow(DomainRuleError);
  });

  it('approved changes require active status', () => {
    expect(() => assertSubcontractAcceptsValueChange('active')).not.toThrow();
    expect(() => assertSubcontractAcceptsValueChange('draft')).toThrow(DomainRuleError);
    expect(() => assertSubcontractAcceptsValueChange('cancelled')).toThrow(DomainRuleError);
  });
});

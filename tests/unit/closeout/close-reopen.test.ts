import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertCanClose,
  assertCanReopen,
  assertClassicProjectUsesCloseout,
  assertCloseoutEligibleWorkKind,
  CLOSEOUT_ERROR_JOBS_USE_COMPLETE,
  CLOSEOUT_ERROR_USE_CLOSEOUT,
  CLOSEOUT_ERROR_USE_REOPEN,
  classifyReadiness,
  emptyReadinessFacts,
  isCloseoutEligibleWorkKind,
  shouldInterceptStatusComplete,
  shouldInterceptStatusReopen,
} from '@/modules/closeout';

describe('closeout close and reopen rules', () => {
  it('refuses closeout close for jobs and work orders', () => {
    expect(isCloseoutEligibleWorkKind('project')).toBe(true);
    expect(isCloseoutEligibleWorkKind('job')).toBe(false);
    expect(isCloseoutEligibleWorkKind('work_order')).toBe(false);
    expect(() => assertCloseoutEligibleWorkKind('job')).toThrow(DomainRuleError);
    try {
      assertCloseoutEligibleWorkKind('work_order');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainRuleError);
      expect((error as DomainRuleError).messageKey).toBe(CLOSEOUT_ERROR_JOBS_USE_COMPLETE);
    }
  });

  it('intercepts classic project status→completed so closeout is the path', () => {
    expect(
      shouldInterceptStatusComplete({
        workKind: 'project',
        existingStatus: 'active',
        nextStatus: 'completed',
      }),
    ).toBe(true);
    expect(
      shouldInterceptStatusComplete({
        workKind: 'job',
        existingStatus: 'active',
        nextStatus: 'completed',
      }),
    ).toBe(false);
    expect(() =>
      assertClassicProjectUsesCloseout({
        workKind: 'project',
        existingStatus: 'active',
        nextStatus: 'completed',
      }),
    ).toThrow(DomainRuleError);
    try {
      assertClassicProjectUsesCloseout({
        workKind: 'project',
        existingStatus: 'active',
        nextStatus: 'completed',
      });
    } catch (error) {
      expect((error as DomainRuleError).messageKey).toBe(CLOSEOUT_ERROR_USE_CLOSEOUT);
    }
  });

  it('intercepts classic project reopen via the status field', () => {
    expect(
      shouldInterceptStatusReopen({
        workKind: 'project',
        existingStatus: 'completed',
        nextStatus: 'active',
      }),
    ).toBe(true);
    expect(
      shouldInterceptStatusReopen({
        workKind: 'job',
        existingStatus: 'completed',
        nextStatus: 'active',
      }),
    ).toBe(false);
    try {
      assertClassicProjectUsesCloseout({
        workKind: 'project',
        existingStatus: 'completed',
        nextStatus: 'active',
      });
      throw new Error('expected DomainRuleError');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainRuleError);
      expect((error as DomainRuleError).messageKey).toBe(CLOSEOUT_ERROR_USE_REOPEN);
    }
  });

  it('blocks close when hard readiness items remain', () => {
    const items = classifyReadiness({ ...emptyReadinessFacts(), openDefects: 1 });
    expect(() =>
      assertCanClose({
        workKind: 'project',
        projectStatus: 'active',
        closeoutStatus: 'ready',
        items,
      }),
    ).toThrow(DomainRuleError);
  });

  it('allows close when only warnings remain', () => {
    const items = classifyReadiness({ ...emptyReadinessFacts(), openPurchaseOrders: 1 });
    expect(() =>
      assertCanClose({
        workKind: 'project',
        projectStatus: 'active',
        closeoutStatus: 'ready',
        items,
      }),
    ).not.toThrow();
  });

  it('requires an existing closed project to reopen and does not invent a silent revert', () => {
    expect(() =>
      assertCanReopen({ projectStatus: 'active', closeoutStatus: 'ready' }),
    ).toThrow(DomainRuleError);
    expect(() =>
      assertCanReopen({ projectStatus: 'completed', closeoutStatus: 'closed' }),
    ).not.toThrow();
  });
});

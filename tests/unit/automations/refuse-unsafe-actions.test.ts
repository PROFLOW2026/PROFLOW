import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertSafeAutomationAction,
  filterExecutableActions,
  isUnsafeAutomationAction,
} from '@/modules/automations/domain/safe-actions';
import { UNSAFE_AUTOMATION_ACTIONS } from '@/modules/automations/domain/types';

describe('automations refuse unsafe actions', () => {
  it.each([...UNSAFE_AUTOMATION_ACTIONS])('refuses %s', (action) => {
    expect(isUnsafeAutomationAction(action)).toBe(true);
    expect(() => assertSafeAutomationAction(action)).toThrow(DomainRuleError);
  });

  it('allows notify and draft-only actions', () => {
    expect(() => assertSafeAutomationAction('notify')).not.toThrow();
    expect(() => assertSafeAutomationAction('draft_communication')).not.toThrow();
    expect(() => assertSafeAutomationAction('draft_expense')).not.toThrow();
    expect(() => assertSafeAutomationAction('planning_followup')).not.toThrow();
  });

  it('filters unsafe requests out of a mixed action list', () => {
    const { allowed, refused } = filterExecutableActions([
      { kind: 'notify' },
      { kind: 'pay_vendor' },
      { kind: 'release_retention' },
      { kind: 'draft_communication' },
    ]);
    expect(allowed.map((item) => item.kind)).toEqual(['notify', 'draft_communication']);
    expect(refused).toEqual(['pay_vendor', 'release_retention']);
  });
});

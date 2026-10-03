import { describe, expect, it } from 'vitest';
import {
  availableExternalTaskCommands,
  planExternalTaskTransition,
} from '@/modules/collaboration/domain/task-lifecycle';
import { DomainRuleError } from '@/shared/errors';

describe('external task lifecycle (pure)', () => {
  const base = {
    cycle: 1,
    requiresEvidence: true,
    lastSubmittedEvidenceCount: null as number | null,
  };

  it('walks acknowledge -> start -> submit with evidence gate', () => {
    let state = { ...base, status: 'assigned' as const };
    state = { ...state, status: planExternalTaskTransition(state, { type: 'acknowledge' }, 'external').to as typeof state.status };
    expect(state.status).toBe('acknowledged');
    state = { ...state, status: planExternalTaskTransition(state, { type: 'start' }, 'external').to as typeof state.status };
    expect(state.status).toBe('in_progress');
    try {
      planExternalTaskTransition(state, { type: 'submit_completion', evidenceCount: 0 }, 'external');
      expect.unreachable('expected evidence error');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainRuleError);
      expect((error as DomainRuleError).messageKey).toBe('collaboration.errors.evidenceRequired');
    }
    const submitted = planExternalTaskTransition(state, { type: 'submit_completion', evidenceCount: 2 }, 'external');
    expect(submitted.to).toBe('completion_submitted');
  });

  it('requires new evidence on resubmit after rejection', () => {
    const state = {
      status: 'reopened' as const,
      cycle: 2,
      requiresEvidence: true,
      lastSubmittedEvidenceCount: 2,
    };
    try {
      planExternalTaskTransition(state, { type: 'submit_completion', evidenceCount: 2 }, 'external');
      expect.unreachable('expected new evidence error');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainRuleError);
      expect((error as DomainRuleError).messageKey).toBe('collaboration.errors.newEvidenceRequired');
    }
    expect(
      planExternalTaskTransition(state, { type: 'submit_completion', evidenceCount: 3 }, 'external').to,
    ).toBe('resubmitted');
  });

  it('lists commands per actor', () => {
    expect(availableExternalTaskCommands({ status: 'assigned' }, 'external')).toEqual(['acknowledge']);
    expect(availableExternalTaskCommands({ status: 'completion_submitted' }, 'internal')).toContain('verify');
    expect(availableExternalTaskCommands({ status: 'closed' }, 'internal')).toEqual(['reopen']);
  });
});

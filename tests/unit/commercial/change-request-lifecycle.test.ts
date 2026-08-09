import { describe, expect, it } from 'vitest';
import {
  canTransitionChangeRequest,
  isPendingChangeStatus,
  isTerminalChangeRequestStatus,
} from '@/modules/commercial/domain/change-request-lifecycle';

describe('change request lifecycle (U7/C2)', () => {
  it('allows draft → awaiting approval → approved/rejected/cancelled', () => {
    expect(canTransitionChangeRequest('draft', 'awaiting_approval')).toBe(true);
    expect(canTransitionChangeRequest('awaiting_approval', 'approved')).toBe(true);
    expect(canTransitionChangeRequest('awaiting_approval', 'rejected')).toBe(true);
    expect(canTransitionChangeRequest('awaiting_approval', 'cancelled')).toBe(true);
  });

  it('blocks illegal transitions', () => {
    expect(canTransitionChangeRequest('draft', 'approved')).toBe(false);
    expect(canTransitionChangeRequest('approved', 'draft')).toBe(false);
    expect(canTransitionChangeRequest('rejected', 'awaiting_approval')).toBe(false);
  });

  it('marks terminal statuses', () => {
    expect(isTerminalChangeRequestStatus('approved')).toBe(true);
    expect(isTerminalChangeRequestStatus('draft')).toBe(false);
  });

  it('treats draft and awaiting approval as pending commercial value', () => {
    expect(isPendingChangeStatus('draft')).toBe(true);
    expect(isPendingChangeStatus('awaiting_approval')).toBe(true);
    expect(isPendingChangeStatus('approved')).toBe(false);
  });
});

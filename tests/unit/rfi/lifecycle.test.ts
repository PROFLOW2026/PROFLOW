import { describe, expect, it } from 'vitest';
import {
  availableRfiActions,
  canRfiTransition,
  isRfiOverdue,
  nextRfiStatus,
  rfiActionRequiresReason,
} from '@/modules/rfi/domain/lifecycle';

describe('RFI lifecycle (Track KL)', () => {
  it('allows internal transitions and blocks contractors from answering', () => {
    expect(canRfiTransition('draft', 'submit', 'internal')).toBe(true);
    expect(canRfiTransition('submitted', 'answer', 'external')).toBe(false);
    expect(nextRfiStatus('submitted', 'start_review')).toBe('under_review');
  });

  it('requires a reason to close without an answer or to reopen', () => {
    expect(rfiActionRequiresReason('submitted', 'close')).toBe(true);
    expect(rfiActionRequiresReason('answered', 'close')).toBe(false);
    expect(rfiActionRequiresReason('closed', 'reopen')).toBe(true);
  });

  it('marks submitted RFIs past due as overdue', () => {
    expect(isRfiOverdue({ status: 'submitted', dueDate: '2026-01-01' }, '2026-01-10')).toBe(true);
    expect(isRfiOverdue({ status: 'closed', dueDate: '2026-01-01' }, '2026-01-10')).toBe(false);
  });

  it('lists actions available to managers by status', () => {
    expect(availableRfiActions('submitted')).toEqual(['start_review', 'answer', 'close']);
  });
});

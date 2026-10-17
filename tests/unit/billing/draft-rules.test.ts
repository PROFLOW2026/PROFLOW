import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/shared/errors';
import {
  assertFinalizeDueDateOrder,
  draftAmountExceedsContractCurrent,
  statutoryStatusBlocksDraftEdit,
} from '@/modules/billing/domain/draft-rules';

describe('draft billing rules', () => {
  it('rejects finalize when the due date is before the issue date', () => {
    expect(() => assertFinalizeDueDateOrder('2026-04-10', '2026-04-01')).toThrow(ValidationError);
    try {
      assertFinalizeDueDateOrder('2026-04-10', '2026-04-01');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const issue = (error as ValidationError).issues[0];
      expect(issue?.path).toBe('dueDate');
      expect(issue?.messageKey).toBe('billing.errors.dueBeforeIssue');
    }
  });

  it('allows finalize when the due date is missing or on/after the issue date', () => {
    expect(() => assertFinalizeDueDateOrder('2026-04-10', null)).not.toThrow();
    expect(() => assertFinalizeDueDateOrder('2026-04-10', '2026-04-10')).not.toThrow();
    expect(() => assertFinalizeDueDateOrder('2026-04-10', '2026-05-01')).not.toThrow();
  });

  it('warns when the draft amount exceeds the linked contract current value without treating that as a block', () => {
    expect(draftAmountExceedsContractCurrent('999999999', '1500')).toBe(true);
    expect(draftAmountExceedsContractCurrent('1500', '1500')).toBe(false);
    expect(draftAmountExceedsContractCurrent('1499.99', '1500')).toBe(false);
    expect(draftAmountExceedsContractCurrent('2000', null)).toBe(false);
  });

  it('treats issued statutory documents as outside the draft edit path', () => {
    expect(statutoryStatusBlocksDraftEdit('issued')).toBe(true);
    expect(statutoryStatusBlocksDraftEdit('allocated')).toBe(true);
    expect(statutoryStatusBlocksDraftEdit('credited')).toBe(true);
    expect(statutoryStatusBlocksDraftEdit('pending')).toBe(false);
    expect(statutoryStatusBlocksDraftEdit('failed')).toBe(false);
    expect(statutoryStatusBlocksDraftEdit('cancelled')).toBe(false);
  });
});

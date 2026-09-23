import { describe, expect, it } from 'vitest';
import { assertRestorable } from '@/modules/expenses/domain/lifecycle';

describe('restoreVoidedExpense lifecycle', () => {
  it('allows restore only for simple void rows', () => {
    expect(() => assertRestorable('void', null)).not.toThrow();
  });

  it('rejects finalized and reversal rows', () => {
    expect(() => assertRestorable('finalized', null)).toThrow();
    expect(() => assertRestorable('void', 'original-id')).toThrow();
  });
});

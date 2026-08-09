import { DomainRuleError } from '@/shared/errors';
import type { ExpenseStatus } from './types';

export function assertEditable(status: ExpenseStatus): void {
  if (status !== 'draft') {
    throw new DomainRuleError(
      'Only draft expenses can be edited',
      'expenses.errors.notEditable',
      { status },
    );
  }
}

export function assertFinalizable(status: ExpenseStatus): void {
  if (status !== 'draft') {
    throw new DomainRuleError(
      'Only draft expenses can be finalized',
      'expenses.errors.notFinalizable',
      { status },
    );
  }
}

export function assertVoidable(status: ExpenseStatus, voidsExpenseId: string | null): void {
  if (status !== 'finalized') {
    throw new DomainRuleError(
      'Only finalized expenses can be voided',
      'expenses.errors.notVoidable',
      { status },
    );
  }
  if (voidsExpenseId) {
    throw new DomainRuleError(
      'Reversal entries cannot be voided again',
      'expenses.errors.reversalNotVoidable',
    );
  }
}

export function statusShape(status: ExpenseStatus): 'draft' | 'approved' | 'void' {
  if (status === 'draft') return 'draft';
  if (status === 'void') return 'void';
  return 'approved';
}

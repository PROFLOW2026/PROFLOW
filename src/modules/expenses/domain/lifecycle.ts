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

export function assertVoidable(
  status: ExpenseStatus,
  voidsExpenseId: string | null,
  hasActiveReversal = false,
): void {
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
  if (hasActiveReversal) {
    throw new DomainRuleError(
      'Expense already has a reversing entry; void would leave a lone negative Actual',
      'expenses.errors.alreadyReversed',
    );
  }
}

/** Original must be finalized, not itself a reversal/adjustment row, and not already reversed. */
export function assertReversible(
  status: ExpenseStatus,
  voidsExpenseId: string | null,
  adjustsExpenseId: string | null,
  hasActiveReversal: boolean,
): void {
  if (status !== 'finalized') {
    throw new DomainRuleError(
      'Only finalized expenses can be reversed',
      'expenses.errors.notReversible',
      { status },
    );
  }
  if (voidsExpenseId) {
    throw new DomainRuleError(
      'Reversal entries cannot be reversed again',
      'expenses.errors.reversalNotReversible',
    );
  }
  if (adjustsExpenseId) {
    throw new DomainRuleError(
      'Adjustment entries cannot be reversed with voidsExpenseId; void or reverse the corrected original',
      'expenses.errors.adjustmentNotReversible',
    );
  }
  if (hasActiveReversal) {
    throw new DomainRuleError(
      'A reversing entry already exists for this expense',
      'expenses.errors.alreadyReversed',
    );
  }
}

export function assertAdjustableOriginal(
  status: ExpenseStatus,
  voidsExpenseId: string | null,
): void {
  if (status !== 'finalized') {
    throw new DomainRuleError(
      'Only finalized expenses can receive an adjustment replacement',
      'expenses.errors.notAdjustable',
      { status },
    );
  }
  if (voidsExpenseId) {
    throw new DomainRuleError(
      'Reversal entries cannot be adjusted',
      'expenses.errors.reversalNotAdjustable',
    );
  }
}

export function statusShape(status: ExpenseStatus): 'draft' | 'approved' | 'void' {
  if (status === 'draft') return 'draft';
  if (status === 'void') return 'void';
  return 'approved';
}

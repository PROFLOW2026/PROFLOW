import { finalizeExpense } from '@/modules/expenses';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findActiveLinkForExpenseRow } from '../data/ops-expense-links';
import {
  finalizeLinkedExpenseSchema,
  type FinalizeLinkedExpenseInput,
} from '../validation/schemas';

export type FinalizeExpenseFn = (
  context: OrgContext,
  expenseId: string,
) => Promise<{ id: string; status: string }>;

/**
 * Finalize path for ops-linked expenses - delegates to existing finalizeExpense.
 * Does not reimplement allocation / tax / Actual recognition.
 */
export async function finalizeLinkedOpsExpense(
  context: OrgContext,
  raw: FinalizeLinkedExpenseInput,
  deps: { finalizeExpense?: FinalizeExpenseFn } = {},
) {
  assertPermission(context, PERMISSIONS.EXPENSES_FINALIZE);

  const parsed = finalizeLinkedExpenseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const link = await findActiveLinkForExpenseRow(context, parsed.data.expenseId);
  if (!link) {
    throw new DomainRuleError(
      'Expense is not linked to an operational record',
      'opsFinance.errors.notLinked',
    );
  }

  const finalize = deps.finalizeExpense ?? finalizeExpense;
  const finalized = await finalize(context, parsed.data.expenseId);
  if (!finalized) throw new NotFoundError('Expense');
  return { link, expense: finalized };
}

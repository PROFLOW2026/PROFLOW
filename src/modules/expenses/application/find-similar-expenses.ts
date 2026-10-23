import type { OrgContext } from '@/shared/auth/context';
import { businessDate } from '@/shared/dates';
import { ValidationError } from '@/shared/errors';
import { findSimilarExpenses } from '../data/expenses.repository';
import { previewSimilarExpenseSchema, type PreviewSimilarExpenseInput } from '../validation/schemas';

export async function listSimilarExpenses(
  context: OrgContext,
  rawInput: PreviewSimilarExpenseInput,
) {
  const parsed = previewSimilarExpenseSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  return findSimilarExpenses(context.db, context.organizationId, {
    excludeExpenseId: input.expenseId,
    expenseDate: businessDate(input.expenseDate),
    grossAmount: input.grossAmount,
    vendorId: input.vendorId ?? null,
  });
}

import { DomainRuleError } from '@/shared/errors';
import type { ExpenseDraftPayload } from '../domain/types';

export function resolveAutoFinalizeFromCreationMode(
  creationMode: string | null | undefined,
): boolean {
  if (creationMode === 'draft') return false;
  return true;
}

export function hasExplicitRecurringCategory(payload: ExpenseDraftPayload): boolean {
  const id = payload.costCategoryId?.trim();
  return Boolean(id);
}

export function assertExplicitRecurringCategory(payload: ExpenseDraftPayload): void {
  if (!hasExplicitRecurringCategory(payload)) {
    throw new DomainRuleError(
      'Recurring expense requires an explicit cost category before generating actual expenses',
      'recurringDrafts.errors.categoryRequiredForActual',
    );
  }
}

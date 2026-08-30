import type { ExpenseSummary } from '../domain/types';

const REVERSAL_PREFIX = /^Reversal:\s*/i;

/** Visible expense name — stored description, else recurring template title (read fallback). */
export function resolveExpenseDisplayDescription(
  expense: Pick<ExpenseSummary, 'description'> & {
    readonly recurringSourceTitle?: string | null;
  },
): string | null {
  const direct = expense.description?.trim();
  if (direct) return direct;
  const recurring = expense.recurringSourceTitle?.trim();
  if (recurring) return recurring;
  return null;
}

export function formatReversalDescription(
  description: string | null | undefined,
  t: (key: string, values?: Record<string, string>) => string,
): string {
  const raw = description?.trim() ?? '';
  const base = raw.replace(REVERSAL_PREFIX, '').trim();
  if (base) {
    return `${t('list.reversalPrefix')}: ${base}`;
  }
  return raw || t('list.noDescription');
}

/** Localized list label — avoids English "Reversal:" stored on reversal rows. */
export function expenseListLabel(
  expense: Pick<
    ExpenseSummary,
    'description' | 'supplierName' | 'voidsExpenseId' | 'adjustsExpenseId'
  > & { readonly recurringSourceTitle?: string | null },
  t: (key: string, values?: Record<string, string>) => string,
): string {
  if (expense.voidsExpenseId) {
    const raw = expense.description?.trim() ?? '';
    const base = raw.replace(REVERSAL_PREFIX, '').trim();
    if (base) {
      return `${t('list.reversalPrefix')}: ${base}`;
    }
    return t('detail.reversalOf', { id: expense.voidsExpenseId.slice(0, 8) });
  }
  if (expense.adjustsExpenseId) {
    const description = expense.description?.trim();
    if (description) {
      return `${t('list.adjustmentPrefix')}: ${description}`;
    }
    return t('detail.adjustmentOf', { id: expense.adjustsExpenseId.slice(0, 8) });
  }
  return resolveExpenseDisplayDescription(expense) || t('list.noDescription');
}

const MISSING_SUPPLIER = '—';

/** List/table supplier column — vendor link wins over free-text supplier name. */
export function expenseSupplierDisplay(
  expense: Pick<ExpenseSummary, 'vendorName' | 'supplierName'>,
): string {
  const linkedVendor = expense.vendorName?.trim();
  if (linkedVendor) return linkedVendor;
  const storedSupplier = expense.supplierName?.trim();
  if (storedSupplier) return storedSupplier;
  return MISSING_SUPPLIER;
}

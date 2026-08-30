/** Default page size for /expenses list UI. */
export const EXPENSE_LIST_PAGE_SIZE = 50;

export function expenseListPageCount(total: number, pageSize = EXPENSE_LIST_PAGE_SIZE): number {
  const size = Math.max(1, pageSize);
  if (total <= 0) return 0;
  return Math.ceil(total / size);
}

/** Clamp out-of-range page requests safely (1-based). */
export function resolveExpenseListPage(
  total: number,
  requestedPage: number,
  pageSize = EXPENSE_LIST_PAGE_SIZE,
): number {
  const count = expenseListPageCount(total, pageSize);
  if (count === 0) return 1;
  return Math.min(Math.max(1, requestedPage), count);
}

export function expenseListOffset(page: number, pageSize = EXPENSE_LIST_PAGE_SIZE): number {
  return Math.max(0, (Math.max(1, page) - 1) * pageSize);
}

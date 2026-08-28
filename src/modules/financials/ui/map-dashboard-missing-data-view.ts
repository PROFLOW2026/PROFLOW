import { expenseSupplierDisplay } from '@/modules/expenses/ui/expense-list-label';
import { buildExpenseDetailHref } from '@/modules/expenses/domain/expense-return-navigation';
import type { DashboardMissingDataItem } from '../domain/dashboard-missing-data';
import type { DashboardMissingDataItemView } from './dashboard-missing-data-trigger';
import { formatBusinessDate } from '@/shared/dates/format';
import { fromNumericString } from '@/shared/money';
import { formatMoney } from '@/shared/money/format';

type TranslateFn = (key: string, values?: Record<string, string | number>) => string;

export function mapDashboardMissingDataToView(
  items: readonly DashboardMissingDataItem[],
  t: TranslateFn,
  options: { readonly locale: string } = { locale: 'he-IL' },
): DashboardMissingDataItemView[] {
  const { locale } = options;

  return items.map((item) => {
    const countSuffix =
      item.count != null && item.count > 0 && item.code !== 'unallocated_remainder'
        ? t(`missingData.items.${item.code}.descriptionCount`, { count: item.count })
        : null;
    const baseDescription = t(`missingData.items.${item.code}.description`);

    const statsLine =
      item.code === 'unallocated_remainder' && item.count != null && item.count > 0 && item.amount
        ? t('missingData.unallocatedStatsLine', {
            count: item.count,
            amount: formatMoney(item.amount, locale),
          })
        : null;

    const expenseRows =
      item.expenseSamples?.map((expense) => {
        const supplier = expenseSupplierDisplay(expense);
        const description = expense.description?.trim();
        const amount =
          fromNumericString(expense.netAmount, expense.currency) ??
          ({ amount: expense.netAmount, currency: expense.currency } as const);
        const parts = [
          formatBusinessDate(expense.expenseDate as never, locale, 'short'),
          supplier,
        ];
        if (description && description !== supplier) {
          parts.push(description);
        }
        parts.push(formatMoney(amount, locale));
        return {
          href: buildExpenseDetailHref(expense.id, {
            focus: 'allocation',
            returnTo: '/expenses?unallocated=true',
          }),
          label: parts.join(' · '),
        };
      }) ?? [];

    const remainingExpenseCount =
      item.code === 'unallocated_remainder' &&
      item.count != null &&
      expenseRows.length > 0 &&
      item.count > expenseRows.length
        ? item.count - expenseRows.length
        : 0;

    return {
      code: item.code,
      kind: item.kind,
      title: t(`missingData.items.${item.code}.title`),
      description: countSuffix ? `${baseDescription} ${countSuffix}` : baseDescription,
      why: t(`missingData.items.${item.code}.why`),
      clarification:
        item.code === 'unallocated_remainder'
          ? t('missingData.unallocatedNotMissing')
          : null,
      statsLine,
      expenseRows,
      remainingExpensesMore:
        remainingExpenseCount > 0
          ? t('missingData.remainingExpensesLabel', { count: remainingExpenseCount })
          : null,
      actionHref: item.actionHref,
      actionLabel: t(`missingData.items.${item.code}.action`),
    };
  });
}

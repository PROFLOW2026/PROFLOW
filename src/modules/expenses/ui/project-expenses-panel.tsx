import { Receipt } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { isZeroMoney, type MoneyValue } from '@/shared/money';
import { cn } from '@/shared/ui/cn';
import { formatBusinessDate } from '@/shared/dates/format';
import { listExpensesForOrg } from '../application/queries';
import { statusShape } from '../domain/lifecycle';

export interface ProjectExpensesPanelProps {
  readonly projectId: string;
  readonly limit?: number;
}

function hasRecoverableTax(taxAmount: MoneyValue | null): boolean {
  return taxAmount != null && !isZeroMoney(taxAmount);
}

/**
 * Embeddable server component for a project workspace Expenses tab (workstream 1).
 */
export async function ProjectExpensesPanel({ projectId, limit = 10 }: ProjectExpensesPanelProps) {
  const t = await getTranslations('expenses');
  const tStatus = await getTranslations('status');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();

  const { items } = await withOrgContext((context) =>
    listExpensesForOrg(context, { projectId, limit }),
  );

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title={t('projectPanel.empty.title')}
        description={t('projectPanel.empty.description')}
        action={
          <Button asChild size="sm">
            <Link href={`/expenses/new?projectId=${projectId}`}>{t('projectPanel.empty.action')}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 text-start text-sm font-semibold text-[var(--pf-text-primary)]">
          {t('projectPanel.title')}
        </h3>
        <Button asChild variant="secondary" size="sm" className="max-w-full shrink-0">
          <Link href={`/expenses/new?projectId=${projectId}`}>{t('actions.add')}</Link>
        </Button>
      </div>

      <ResponsiveTable
        items={items}
        getRowKey={(expense) => expense.id}
        desktop={
          <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('fields.date')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('fields.description')}</TableHead>
                  <TableHead numeric>{t('fields.grossAmount')}</TableHead>
                  <TableHead numeric className="hidden md:table-cell">
                    {t('fields.netCostBasis')}
                  </TableHead>
                  <TableHead>{t('fields.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((expense) => {
                  const showNet = hasRecoverableTax(expense.taxAmount);
                  return (
                    <TableRow key={expense.id}>
                      <TableCell>
                        <Link
                          href={`/expenses/${expense.id}`}
                          className={cn(textNavLinkClassName, 'block font-medium')}
                          dir="ltr"
                        >
                          {formatBusinessDate(expense.expenseDate, locale, 'short')}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden max-w-[12rem] truncate text-start sm:table-cell">
                        <Link
                          href={`/expenses/${expense.id}`}
                          className={cn(textNavLinkClassName, 'block')}
                        >
                          {expense.description || expense.supplierName || t('list.noDescription')}
                        </Link>
                      </TableCell>
                      <TableCell numeric>
                        <Link
                          href={`/expenses/${expense.id}`}
                          className={cn(textNavLinkClassName, 'block')}
                        >
                          <MoneyText value={expense.grossAmount} />
                          {showNet ? (
                            <span className="mt-0.5 block text-xs font-normal text-[var(--pf-text-muted)] md:hidden">
                              {t('fields.netCostBasis')}: <MoneyText value={expense.netAmount} />
                            </span>
                          ) : null}
                        </Link>
                      </TableCell>
                      <TableCell numeric className="hidden md:table-cell">
                        <Link
                          href={`/expenses/${expense.id}`}
                          className={cn(textNavLinkClassName, 'block')}
                        >
                          {showNet ? (
                            <MoneyText value={expense.netAmount} />
                          ) : (
                            <span className="text-[var(--pf-text-muted)]">-</span>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={statusShape(expense.status)}
                          label={tStatus(`expense.${expense.status}`)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        }
        renderMobileCard={(expense) => {
          const showNet = hasRecoverableTax(expense.taxAmount);
          return (
            <Link
              href={`/expenses/${expense.id}`}
              className={cn(pressableCardLinkClassName, 'text-start')}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 font-semibold" dir="ltr">
                  {formatBusinessDate(expense.expenseDate, locale, 'short')}
                </span>
                <StatusBadge
                  className="shrink-0"
                  shape={statusShape(expense.status)}
                  label={tStatus(`expense.${expense.status}`)}
                />
              </div>
              <p className="mt-1 truncate text-sm text-[var(--pf-text-secondary)]">
                {expense.description || expense.supplierName || t('list.noDescription')}
              </p>
              <div className="mt-2 flex flex-col gap-0.5 text-sm">
                <p>
                  <span className="text-[var(--pf-text-muted)]">{t('fields.grossAmount')}: </span>
                  <MoneyText value={expense.grossAmount} />
                </p>
                {showNet ? (
                  <p className="text-[var(--pf-text-secondary)]">
                    <span className="text-[var(--pf-text-muted)]">{t('fields.netCostBasis')}: </span>
                    <MoneyText value={expense.netAmount} />
                  </p>
                ) : null}
              </div>
            </Link>
          );
        }}
      />

      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href={`/expenses?projectId=${projectId}`}>{tCommon('actions.viewAll')}</Link>
      </Button>
    </div>
  );
}

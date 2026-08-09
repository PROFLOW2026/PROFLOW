import { Receipt } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
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
import { formatBusinessDate } from '@/shared/dates/format';
import { listExpensesForOrg } from '../application/queries';
import { statusShape } from '../domain/lifecycle';

export interface ProjectExpensesPanelProps {
  readonly projectId: string;
  readonly limit?: number;
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
                  <TableHead numeric>{t('fields.amount')}</TableHead>
                  <TableHead>{t('fields.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell>
                      <Link href={`/expenses/${expense.id}`} className="block" dir="ltr">
                        {formatBusinessDate(expense.expenseDate, locale, 'short')}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden max-w-[12rem] truncate text-start sm:table-cell">
                      <Link href={`/expenses/${expense.id}`} className="block">
                        {expense.description || expense.supplierName || t('list.noDescription')}
                      </Link>
                    </TableCell>
                    <TableCell numeric>
                      <Link href={`/expenses/${expense.id}`} className="block">
                        <MoneyText value={expense.grossAmount} />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        shape={statusShape(expense.status)}
                        label={tStatus(`expense.${expense.status}`)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        }
        renderMobileCard={(expense) => (
          <Link
            href={`/expenses/${expense.id}`}
            className="block min-h-11 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 text-start"
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
            <p className="mt-2 text-sm">
              <MoneyText value={expense.grossAmount} />
            </p>
          </Link>
        )}
      />

      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href={`/expenses?projectId=${projectId}`}>{tCommon('actions.viewAll')}</Link>
      </Button>
    </div>
  );
}

import { Receipt } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { MoneyText } from '@/components/patterns/money-text';
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
import type { ExpenseSummary } from '../domain/types';

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
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--pf-text-primary)]">{t('projectPanel.title')}</h3>
        <Button asChild variant="secondary" size="sm">
          <Link href={`/expenses/new?projectId=${projectId}`}>{t('actions.add')}</Link>
        </Button>
      </div>

      <ExpenseRows items={items} locale={locale} t={t} tStatus={tStatus} />

      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href={`/expenses?projectId=${projectId}`}>{tCommon('actions.viewAll')}</Link>
      </Button>
    </div>
  );
}

function ExpenseRows({
  items,
  locale,
  t,
  tStatus,
}: {
  items: ExpenseSummary[];
  locale: string;
  t: Awaited<ReturnType<typeof getTranslations<'expenses'>>>;
  tStatus: Awaited<ReturnType<typeof getTranslations<'status'>>>;
}) {
  return (
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
          <TableRow key={expense.id} className="cursor-pointer">
            <TableCell>
              <Link href={`/expenses/${expense.id}`} className="block">
                {formatBusinessDate(expense.expenseDate, locale, 'short')}
              </Link>
            </TableCell>
            <TableCell className="hidden max-w-[12rem] truncate sm:table-cell">
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
  );
}

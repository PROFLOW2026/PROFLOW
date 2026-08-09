import { getLocale, getTranslations } from 'next-intl/server';
import { FilePenLine } from 'lucide-react';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Link } from '@/shared/i18n/navigation';
import { businessDate } from '@/shared/dates/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import { fromNumericString } from '@/shared/money/money';
import { signedChangeAmount } from '../domain/contract-value';
import type { ChangeRequestListItem } from '../domain/types';
import { ChangeStatusBadge } from './change-status-badge';

export interface ChangeRequestListProps {
  items: readonly ChangeRequestListItem[];
  projectId?: string;
  canManage: boolean;
}

function listDate(item: ChangeRequestListItem): string {
  return item.requestedDate ?? item.createdAt.toISOString().slice(0, 10);
}

export async function ChangeRequestList({ items, projectId, canManage }: ChangeRequestListProps) {
  const t = await getTranslations('changes');
  const locale = await getLocale();

  if (items.length === 0) {
    return (
      <EmptyState
        icon={FilePenLine}
        title={t('empty.title')}
        description={t('empty.description')}
        action={
          canManage ? (
            <Button asChild>
              <Link href={projectId ? `/changes/new?projectId=${projectId}` : '/changes/new'}>
                {t('empty.action')}
              </Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <ResponsiveTable
      items={items}
      getRowKey={(item) => item.id}
      desktop={
        <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('list.reference')}</TableHead>
                <TableHead>{t('list.title')}</TableHead>
                {!projectId ? <TableHead>{t('list.project')}</TableHead> : null}
                <TableHead numeric>{t('list.amount')}</TableHead>
                <TableHead>{t('list.status')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('list.date')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const raw = item.pricedAmount ?? item.requestedAmount;
                const magnitude = raw ? fromNumericString(raw, item.currency) : null;
                const signed =
                  magnitude !== null ? signedChangeAmount(item.direction, magnitude) : null;

                return (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-[8rem] truncate font-mono text-xs" dir="ltr">
                      {item.reference ?? '—'}
                    </TableCell>
                    <TableCell className="max-w-[14rem] truncate text-start">
                      <Link
                        href={`/changes/${item.id}`}
                        className="font-medium text-[var(--pf-text-brand)] hover:underline"
                      >
                        {item.title}
                      </Link>
                    </TableCell>
                    {!projectId ? (
                      <TableCell className="max-w-[12rem] truncate">{item.projectName}</TableCell>
                    ) : null}
                    <TableCell numeric>
                      {signed ? <MoneyText value={signed} colorizeNegative /> : '—'}
                    </TableCell>
                    <TableCell>
                      <ChangeStatusBadge status={item.status} sentAt={item.sentAt} />
                    </TableCell>
                    <TableCell className="hidden text-sm text-[var(--pf-text-secondary)] sm:table-cell">
                      <span dir="ltr">{formatBusinessDate(businessDate(listDate(item)), locale, 'short')}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      }
      renderMobileCard={(item) => {
        const raw = item.pricedAmount ?? item.requestedAmount;
        const magnitude = raw ? fromNumericString(raw, item.currency) : null;
        const signed =
          magnitude !== null ? signedChangeAmount(item.direction, magnitude) : null;

        return (
          <Link
            href={`/changes/${item.id}`}
            className="block min-h-11 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 text-start"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 flex-1 truncate font-semibold">{item.title}</span>
              <ChangeStatusBadge className="shrink-0" status={item.status} sentAt={item.sentAt} />
            </div>
            <p className="mt-1 truncate text-start text-sm text-[var(--pf-text-secondary)]">
              <span dir="ltr">{item.reference ?? '—'}</span>
              {!projectId && item.projectName ? ` · ${item.projectName}` : null}
            </p>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
              {signed ? <MoneyText value={signed} colorizeNegative /> : <span>—</span>}
              <span className="text-[var(--pf-text-muted)]" dir="ltr">
                {formatBusinessDate(businessDate(listDate(item)), locale, 'short')}
              </span>
            </div>
          </Link>
        );
      }}
    />
  );
}

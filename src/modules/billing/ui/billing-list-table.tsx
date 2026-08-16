'use client';

import { useTranslations } from 'next-intl';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { formatBusinessDate } from '@/shared/dates/format';
import type { BillingRecordSummary } from '@/modules/billing/domain/types';
import { BillingStatusBadge } from './billing-status-badge';

interface BillingListTableProps {
  records: readonly BillingRecordSummary[];
  locale: string;
}

export function BillingListTable({ records, locale }: BillingListTableProps) {
  const t = useTranslations('billing');
  const tKind = useTranslations('billing.kinds');

  if (records.length === 0) {
    return null;
  }

  return (
    <ResponsiveTable
      items={records}
      getRowKey={(record) => record.id}
      desktop={
        <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('list.project')}</TableHead>
                <TableHead>{t('list.contract')}</TableHead>
                <TableHead>{t('list.reference')}</TableHead>
                <TableHead>{t('list.kind')}</TableHead>
                <TableHead>{t('list.issueDate')}</TableHead>
                <TableHead numeric>{t('list.amount')}</TableHead>
                <TableHead numeric>{t('list.paid')}</TableHead>
                <TableHead numeric>{t('list.outstanding')}</TableHead>
                <TableHead>{t('list.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="max-w-[12rem] truncate">
                    <Link
                      href={`/billing/${record.id}`}
                      className={cn(textNavLinkClassName, 'font-medium')}
                    >
                      {record.projectName ?? t('list.unknownProject')}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[10rem] truncate">
                    {record.contractName ?? '-'}
                  </TableCell>
                  <TableCell className="max-w-[8rem] truncate">{record.reference ?? '-'}</TableCell>
                  <TableCell>
                    <span className="text-sm">{tKind(record.kind)}</span>
                  </TableCell>
                  <TableCell>
                    <span dir="ltr">{formatBusinessDate(record.issueDate, locale, 'short')}</span>
                  </TableCell>
                  <TableCell numeric>
                    <MoneyText value={record.totalAmount} />
                  </TableCell>
                  <TableCell numeric>
                    <MoneyText value={record.paidAmount} />
                  </TableCell>
                  <TableCell numeric>
                    <MoneyText value={record.outstandingAmount} colorizeNegative />
                  </TableCell>
                  <TableCell>
                    <BillingStatusBadge status={record.status} collectionStatus={record.collectionStatus} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      }
      renderMobileCard={(record) => (
        <Link
          href={`/billing/${record.id}`}
          className={cn(pressableCardLinkClassName, 'text-start')}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 flex-1 truncate font-semibold">
              {record.projectName ?? t('list.unknownProject')}
            </span>
            <BillingStatusBadge
              className="shrink-0"
              status={record.status}
              collectionStatus={record.collectionStatus}
            />
          </div>
          <p className="mt-1 text-start text-sm text-[var(--pf-text-secondary)]">
            {record.reference ?? '-'}
            {record.contractName ? ` · ${record.contractName}` : ''}
            {' · '}
            {tKind(record.kind)}
            {' · '}
            <span dir="ltr">{formatBusinessDate(record.issueDate, locale, 'short')}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span>
              {t('list.amount')}: <MoneyText value={record.totalAmount} />
            </span>
            <span>
              {t('list.outstanding')}:{' '}
              <MoneyText value={record.outstandingAmount} colorizeNegative />
            </span>
          </div>
        </Link>
      )}
    />
  );
}

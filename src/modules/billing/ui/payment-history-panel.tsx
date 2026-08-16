'use client';

import { useTranslations } from 'next-intl';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Link } from '@/shared/i18n/navigation';
import { formatBusinessDate } from '@/shared/dates/format';
import type { PaymentApplicationRow } from '@/modules/billing/domain/types';

interface PaymentHistoryTableProps {
  rows: readonly PaymentApplicationRow[];
  locale: string;
  /** When true, hide the project column (project-scoped view). */
  hideProject?: boolean;
}

export function PaymentHistoryTable({
  rows,
  locale,
  hideProject = false,
}: PaymentHistoryTableProps) {
  const t = useTranslations('billing.paymentHistory');
  const tKind = useTranslations('billing.kinds');
  const tPayment = useTranslations('status.payment');

  if (rows.length === 0) {
    return null;
  }

  return (
    <ResponsiveTable
      items={rows}
      getRowKey={(row) => row.id}
      desktop={
        <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('paymentDate')}</TableHead>
                {!hideProject ? <TableHead>{t('project')}</TableHead> : null}
                <TableHead>{t('billing')}</TableHead>
                <TableHead numeric>{t('amount')}</TableHead>
                <TableHead>{t('method')}</TableHead>
                <TableHead>{t('status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <span dir="ltr">{formatBusinessDate(row.paymentDate, locale, 'short')}</span>
                  </TableCell>
                  {!hideProject ? (
                    <TableCell className="max-w-[12rem] truncate">
                      {row.projectName ?? t('unknownProject')}
                    </TableCell>
                  ) : null}
                  <TableCell className="max-w-[12rem]">
                    <Link
                      href={`/billing/${row.billingRecordId}`}
                      className="font-medium text-[var(--pf-text-brand)]"
                    >
                      {row.billingReference ?? row.billingRecordId.slice(0, 8)}
                    </Link>
                    <span className="mt-0.5 block truncate text-xs text-[var(--pf-text-secondary)]">
                      {tKind(row.billingKind)}
                    </span>
                  </TableCell>
                  <TableCell numeric>
                    <MoneyText value={row.amount} />
                  </TableCell>
                  <TableCell className="max-w-[8rem] truncate">{row.method ?? '-'}</TableCell>
                  <TableCell>
                    <StatusBadge
                      shape={row.status === 'void' ? 'void' : 'approved'}
                      label={tPayment(row.status)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      }
      renderMobileCard={(row) => (
        <Link
          href={`/billing/${row.billingRecordId}`}
          className="block min-h-11 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 text-start"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 flex-1 truncate font-semibold">
              {row.billingReference ?? row.billingRecordId.slice(0, 8)}
            </span>
            <StatusBadge
              className="shrink-0"
              shape={row.status === 'void' ? 'void' : 'approved'}
              label={tPayment(row.status)}
            />
          </div>
          <p className="mt-1 text-start text-sm text-[var(--pf-text-secondary)]">
            {!hideProject ? `${row.projectName ?? t('unknownProject')} · ` : null}
            <span dir="ltr">{formatBusinessDate(row.paymentDate, locale, 'short')}</span>
            {' · '}
            {tKind(row.billingKind)}
          </p>
          <p className="mt-2 text-sm">
            <MoneyText value={row.amount} />
          </p>
        </Link>
      )}
    />
  );
}

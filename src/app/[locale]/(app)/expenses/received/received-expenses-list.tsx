'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n/navigation';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { Inbox } from 'lucide-react';
import type { ReceivedExpenseImportRow } from '@/modules/expense-ingestion/application/list-received-imports';
import type { ExternalExpenseImportStatus } from '@/modules/expense-ingestion';

function statusShape(
  status: ExternalExpenseImportStatus,
): 'active' | 'rejected' | 'void' | 'pending' {
  if (status === 'needs_review') return 'active';
  if (status === 'failed') return 'rejected';
  if (status === 'linked') return 'void';
  return 'pending';
}

export function ReceivedExpensesList({ rows }: { rows: readonly ReceivedExpenseImportRow[] }) {
  const t = useTranslations('expenses.received');

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title={t('empty.title')}
        description={t('empty.body')}
      />
    );
  }

  return (
    <div className="min-w-0 max-w-full rounded-lg border border-[var(--pf-border-default)]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columns.source')}</TableHead>
            <TableHead>{t('columns.received')}</TableHead>
            <TableHead>{t('columns.status')}</TableHead>
            <TableHead>{t('columns.supplier')}</TableHead>
            <TableHead>{t('columns.reference')}</TableHead>
            <TableHead>{t('columns.gross')}</TableHead>
            <TableHead>{t('columns.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const imp = row.import;
            const reviewHref = imp.ocrJobId
              ? `/documents/ocr-review?target=vendor_bill&jobId=${imp.ocrJobId}`
              : null;
            const previewHref = `/api/expense-ingestion/imports/${imp.id}/pdf`;
            return (
              <TableRow key={imp.id}>
                <TableCell>
                  <StatusBadge shape="pending" label={t(`source.${row.sourceLabel}`)} />
                </TableCell>
                <TableCell>{new Date(imp.detectedAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <StatusBadge
                    shape={statusShape(imp.status)}
                    label={t(`status.${imp.status}`)}
                  />
                  {imp.errorCode ? (
                    <p className="mt-1 text-xs text-[var(--pf-status-warning-fg)]">
                      {t(`errors.${imp.errorCode}`, {
                        default: imp.errorMessage ?? t('errors.generic'),
                      })}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell>{row.supplier ?? '—'}</TableCell>
                <TableCell>{row.reference ?? '—'}</TableCell>
                <TableCell>{row.gross ?? row.net ?? '—'}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <a
                      href={previewHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--pf-accent)] hover:underline"
                    >
                      {t('actions.preview')}
                    </a>
                    {reviewHref && row.canReview ? (
                      <Link href={reviewHref} className="text-[var(--pf-accent)] hover:underline">
                        {t('actions.review')}
                      </Link>
                    ) : null}
                    {row.matchedVendorName ? (
                      <span className="text-xs text-[var(--pf-text-secondary)]">
                        {t('matchedVendor', { name: row.matchedVendorName })}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

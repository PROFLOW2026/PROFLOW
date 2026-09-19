'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n/navigation';
import { StatusBadge } from '@/components/ui/status-badge';
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
    <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
      <table className="min-w-full text-sm">
        <thead className="bg-[var(--pf-bg-subtle)] text-start text-[var(--pf-text-secondary)]">
          <tr>
            <th className="px-3 py-2 font-medium">{t('columns.source')}</th>
            <th className="px-3 py-2 font-medium">{t('columns.received')}</th>
            <th className="px-3 py-2 font-medium">{t('columns.status')}</th>
            <th className="px-3 py-2 font-medium">{t('columns.supplier')}</th>
            <th className="px-3 py-2 font-medium">{t('columns.reference')}</th>
            <th className="px-3 py-2 font-medium">{t('columns.gross')}</th>
            <th className="px-3 py-2 font-medium">{t('columns.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const imp = row.import;
            const reviewHref = imp.ocrJobId
              ? `/documents/ocr-review?target=vendor_bill&jobId=${imp.ocrJobId}`
              : null;
            const previewHref = `/api/expense-ingestion/imports/${imp.id}/pdf`;
            return (
              <tr
                key={imp.id}
                className="border-t border-[var(--pf-border-default)] align-top"
              >
                <td className="px-3 py-3">
                  <StatusBadge shape="pending" label={t(`source.${row.sourceLabel}`)} />
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {new Date(imp.detectedAt).toLocaleDateString()}
                </td>
                <td className="px-3 py-3">
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
                </td>
                <td className="px-3 py-3">{row.supplier ?? '—'}</td>
                <td className="px-3 py-3">{row.reference ?? '—'}</td>
                <td className="px-3 py-3">{row.gross ?? row.net ?? '—'}</td>
                <td className="px-3 py-3">
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
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

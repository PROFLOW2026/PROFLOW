'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { buildDocumentContentPath } from '@/modules/documents/domain/content-path';
import { AuthorizedFilePreviewDialog } from '@/modules/external-storage/ui/authorized-file-preview-dialog';
import { EmployeeEmptyState } from './employee-empty-state';
import { EmployeeFileTypeIcon } from './employee-file-type-icon';
import {
  employeeListPanelClass,
  employeeListRowClass,
  employeeMetaChipClass,
} from './employee-surface-styles';

export type EmployeeDocumentRow = {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly category: string | null;
  readonly createdLabel: string;
  readonly status: string;
};

export function EmployeeDocumentsBrowser({ items }: { readonly items: readonly EmployeeDocumentRow[] }) {
  const t = useTranslations('employeeApp.lists');
  const tCommon = useTranslations('common');
  const [openId, setOpenId] = useState<string | null>(null);
  const active = items.find((item) => item.id === openId && item.status === 'available') ?? null;
  const contentUrl = active ? buildDocumentContentPath(active.id, 'inline') : null;

  if (items.length === 0) {
    return <EmployeeEmptyState title={t('documentsEmpty')} icon={FileText} />;
  }

  return (
    <>
      <ul className={employeeListPanelClass}>
        {items.map((doc) => {
          const downloadUrl = buildDocumentContentPath(doc.id, 'attachment');
          const canOpen = doc.status === 'available';
          return (
            <li key={doc.id} className={employeeListRowClass}>
              <EmployeeFileTypeIcon mimeType={doc.mimeType} filename={doc.filename} />
              <button
                type="button"
                className="min-w-0 flex-1 space-y-1 text-start"
                disabled={!canOpen}
                onClick={() => setOpenId(doc.id)}
              >
                <p className="truncate text-sm font-semibold text-[var(--pf-text-primary)]">{doc.filename}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--pf-text-secondary)]">
                  <span className={employeeMetaChipClass}>{doc.category ?? t('noCategory')}</span>
                  <time>{t('documentDate', { date: doc.createdLabel })}</time>
                </div>
              </button>
              {canOpen ? (
                <a href={downloadUrl} download className="shrink-0 text-sm text-[var(--pf-text-secondary)] hover:underline">
                  {tCommon('actions.download')}
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
      <AuthorizedFilePreviewDialog
        open={active !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
        file={
          active && contentUrl
            ? {
                title: active.filename,
                fileName: active.filename,
                mimeType: active.mimeType,
                contentUrl,
                downloadUrl: buildDocumentContentPath(active.id, 'attachment'),
              }
            : null
        }
      />
    </>
  );
}

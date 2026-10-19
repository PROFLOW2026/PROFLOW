'use client';

import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { AuthorizedFilePreviewDialog } from '@/modules/external-storage/ui/authorized-file-preview-dialog';
import { withExplicitAttachment } from '@/modules/contractor-portal/download-paths';
import type { ContractorSharedDocument } from '@/modules/project-plans';
import { acknowledgeSharedDocumentAction } from '@/modules/project-plans/actions/external-actions';
import { EXTERNAL_SHARED_DOCUMENT_DOWNLOAD_PATH } from '@/modules/project-plans/download-paths';

export function ContractorDocumentsList({
  organizationId,
  projectId,
  items,
}: {
  readonly organizationId: string;
  readonly projectId: string;
  readonly items: readonly ContractorSharedDocument[];
}) {
  const t = useTranslations('projectPlans.portal.documents');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openShareId, setOpenShareId] = useState<string | null>(null);
  const active = items.find((item) => item.shareId === openShareId) ?? null;
  const activeUrl = active ? `${EXTERNAL_SHARED_DOCUMENT_DOWNLOAD_PATH}/${active.shareId}` : null;

  if (items.length === 0) {
    return <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>;
  }

  return (
    <>
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.shareId} className="rounded-xl border border-[var(--pf-border-default)] p-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="font-semibold text-[var(--pf-text-brand)] hover:underline"
                onClick={() => setOpenShareId(item.shareId)}
              >
                {item.title}
              </button>
              <a
                href={withExplicitAttachment(`${EXTERNAL_SHARED_DOCUMENT_DOWNLOAD_PATH}/${item.shareId}`)}
                download
                className="text-sm text-[var(--pf-text-secondary)] hover:underline"
              >
                {tCommon('actions.download')}
              </a>
            </div>
            {item.note ? <p className="text-sm text-[var(--pf-text-secondary)]">{item.note}</p> : null}
            {item.acknowledgementRequired && !item.acknowledgedAt ? (
              <Button
                type="button"
                size="sm"
                loading={pending}
                onClick={() => {
                  startTransition(async () => {
                    await acknowledgeSharedDocumentAction({ organizationId, projectId, shareId: item.shareId });
                    router.refresh();
                  });
                }}
              >
                {t('acknowledge')}
              </Button>
            ) : item.acknowledgedAt ? (
              <p className="text-xs text-[var(--pf-text-muted)]">{t('acknowledged')}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
      <AuthorizedFilePreviewDialog
        open={active !== null}
        onOpenChange={(open) => {
          if (!open) setOpenShareId(null);
        }}
        file={
          active && activeUrl
            ? {
                title: active.title,
                fileName: active.fileName,
                mimeType: active.mimeType,
                contentUrl: activeUrl,
                downloadUrl: withExplicitAttachment(activeUrl),
              }
            : null
        }
      />
    </>
  );
}

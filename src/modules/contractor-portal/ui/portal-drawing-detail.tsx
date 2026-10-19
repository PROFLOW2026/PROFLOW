'use client';

import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { AuthorizedFilePreviewDialog } from '@/modules/external-storage/ui/authorized-file-preview-dialog';
import type { ContractorDrawingDetail } from '@/modules/project-plans';
import type { DrawingRevisionStatus } from '@/modules/project-plans/domain/types';
import { acknowledgeDrawingRevisionAction } from '@/modules/project-plans/actions/external-actions';
import { EXTERNAL_REVISION_DOWNLOAD_PATH } from '@/modules/project-plans/download-paths';
import { withExplicitAttachment } from '@/modules/contractor-portal/download-paths';
import { cn } from '@/shared/ui/cn';
import { portalItemCardClass, portalPageTitleClass, portalPanelClass } from './portal-surface';

const REVISION_SHAPE: Record<DrawingRevisionStatus, StatusShape> = {
  draft: 'draft',
  current: 'active',
  superseded: 'archived',
  withdrawn: 'void',
};

export function PortalDrawingDetail({
  organizationId,
  projectId,
  detail,
}: {
  readonly organizationId: string;
  readonly projectId: string;
  readonly detail: ContractorDrawingDetail;
}) {
  const t = useTranslations('projectPlans.portal.drawing');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openRevisionId, setOpenRevisionId] = useState<string | null>(null);
  const current = detail.revisions.find((revision) => revision.status === 'current');
  const history = detail.revisions.filter((revision) => revision.status !== 'current');
  const siblings = detail.revisions
    .filter((revision) => revision.fileReady)
    .map((revision) => ({
      fileName: revision.fileName,
      contentUrl: `${EXTERNAL_REVISION_DOWNLOAD_PATH}/${revision.id}`,
    }));
  const active = detail.revisions.find((revision) => revision.id === openRevisionId && revision.fileReady) ?? null;
  const activeUrl = active ? `${EXTERNAL_REVISION_DOWNLOAD_PATH}/${active.id}` : null;

  return (
    <div className="flex flex-col gap-5">
      <header className="space-y-1.5">
        <h1 className={portalPageTitleClass}>
          {detail.drawing.drawingNumber} · {detail.drawing.title}
        </h1>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t(`discipline.${detail.drawing.discipline}`)}</p>
      </header>

      {current ? (
        <section className={cn(portalPanelClass, 'flex flex-col gap-3.5')}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Rev {current.revisionLabel}</h2>
            <StatusBadge shape={REVISION_SHAPE[current.status]} label={t(`status.${current.status}`)} />
          </div>
          {current.fileReady ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" size="lg" onClick={() => setOpenRevisionId(current.id)}>
                {current.fileName}
              </Button>
              <a
                href={withExplicitAttachment(`${EXTERNAL_REVISION_DOWNLOAD_PATH}/${current.id}`)}
                download
                className="text-sm text-[var(--pf-text-secondary)] hover:underline"
              >
                {tCommon('actions.download')}
              </a>
            </div>
          ) : null}
          {detail.canAcknowledge && current.acknowledgementRequired && !current.acknowledgedAt ? (
            <Button
              type="button"
              variant="secondary"
              loading={pending}
              onClick={() => {
                startTransition(async () => {
                  await acknowledgeDrawingRevisionAction({
                    organizationId,
                    projectId,
                    drawingId: detail.drawing.id,
                    revisionId: current.id,
                  });
                  router.refresh();
                });
              }}
            >
              {t('acknowledgeCurrent')}
            </Button>
          ) : current.acknowledgedAt ? (
            <p className="text-sm text-[var(--pf-text-muted)]">{t('acknowledged')}</p>
          ) : null}
        </section>
      ) : null}

      {history.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {history.map((revision) => (
            <li
              key={revision.id}
              className={cn(portalItemCardClass, 'flex-row flex-wrap items-center justify-between')}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-medium">Rev {revision.revisionLabel}</span>
                <StatusBadge shape={REVISION_SHAPE[revision.status]} label={t(`status.${revision.status}`)} />
              </div>
              {revision.fileReady ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="text-sm text-[var(--pf-text-brand)] hover:underline"
                    onClick={() => setOpenRevisionId(revision.id)}
                  >
                    {revision.fileName}
                  </button>
                  <a
                    href={withExplicitAttachment(`${EXTERNAL_REVISION_DOWNLOAD_PATH}/${revision.id}`)}
                    download
                    className="text-sm text-[var(--pf-text-secondary)] hover:underline"
                  >
                    {tCommon('actions.download')}
                  </a>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <AuthorizedFilePreviewDialog
        open={active !== null}
        onOpenChange={(open) => {
          if (!open) setOpenRevisionId(null);
        }}
        siblings={siblings}
        file={
          active && activeUrl
            ? {
                title: active.fileName,
                fileName: active.fileName,
                mimeType: active.mimeType,
                contentUrl: activeUrl,
                downloadUrl: withExplicitAttachment(activeUrl),
              }
            : null
        }
      />
    </div>
  );
}

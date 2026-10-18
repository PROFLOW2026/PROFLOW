'use client';

import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import type { ContractorDrawingDetail } from '@/modules/project-plans';
import type { DrawingRevisionStatus } from '@/modules/project-plans/domain/types';
import { acknowledgeDrawingRevisionAction } from '@/modules/project-plans/actions/external-actions';
import { EXTERNAL_REVISION_DOWNLOAD_PATH } from '@/modules/project-plans/download-paths';
import { employeePanelClass } from '@/modules/employee-app/ui/employee-surface-styles';
import { cn } from '@/shared/ui/cn';

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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = detail.revisions.find((revision) => revision.status === 'current');
  const history = detail.revisions.filter((revision) => revision.status !== 'current');

  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-[var(--pf-text-primary)]">
          {detail.drawing.drawingNumber} · {detail.drawing.title}
        </h1>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t(`discipline.${detail.drawing.discipline}`)}</p>
      </header>

      {current ? (
        <section className={cn(employeePanelClass, 'flex flex-col gap-3')}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Rev {current.revisionLabel}</h2>
            <StatusBadge shape={REVISION_SHAPE[current.status]} label={t(`status.${current.status}`)} />
          </div>
          {current.fileReady ? (
            <a
              href={`${EXTERNAL_REVISION_DOWNLOAD_PATH}/${current.id}`}
              className={buttonVariants({ variant: 'primary', size: 'lg' })}
              target="_blank"
              rel="noopener noreferrer"
            >
              {current.fileName}
            </a>
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
        <ul className="flex flex-col gap-2">
          {history.map((revision) => (
            <li
              key={revision.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--pf-border-default)] p-3"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-medium">Rev {revision.revisionLabel}</span>
                <StatusBadge shape={REVISION_SHAPE[revision.status]} label={t(`status.${revision.status}`)} />
              </div>
              {revision.fileReady ? (
                <a
                  href={`${EXTERNAL_REVISION_DOWNLOAD_PATH}/${revision.id}`}
                  className="text-sm text-[var(--pf-text-brand)] hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {revision.fileName}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

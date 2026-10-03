'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ContractorDrawingDetail } from '@/modules/project-plans';
import { acknowledgeDrawingRevisionAction } from '@/modules/project-plans/actions/external-actions';
import { EXTERNAL_REVISION_DOWNLOAD_PATH } from '@/modules/project-plans/download-paths';

export function ContractorDrawingDetailPanel({
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

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">
          {detail.drawing.drawingNumber} · {detail.drawing.title}
        </h1>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t(`discipline.${detail.drawing.discipline}`)}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {detail.revisions.map((revision) => (
          <li key={revision.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
            <div>
              <span className="font-medium">Rev {revision.revisionLabel}</span>
              <Badge tone={revision.status === 'current' ? 'success' : 'neutral'} className="ms-2">
                {t(`status.${revision.status}`)}
              </Badge>
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
      {current && detail.canAcknowledge && current.acknowledgementRequired && !current.acknowledgedAt ? (
        <Button
          type="button"
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
      ) : current?.acknowledgedAt ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('acknowledged')}</p>
      ) : null}
    </div>
  );
}

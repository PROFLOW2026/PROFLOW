'use client';

import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { cancelOcrJobAction, extractReceiptAction } from '@/modules/ocr/application/ocr-actions';

export interface OcrQueueJobRow {
  readonly id: string;
  readonly status: 'queued' | 'running' | 'processing' | 'failed';
  readonly filename: string | null;
  readonly documentId: string | null;
}

export function OcrQueueActions({
  jobs,
  canManageDocuments,
}: {
  jobs: readonly OcrQueueJobRow[];
  canManageDocuments: boolean;
}) {
  const t = useTranslations('documents.ocr');
  const tSettings = useTranslations('settings.ocr');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (jobs.length === 0) {
    return <p className="text-sm text-[var(--pf-text-secondary)]">{tSettings('queueEmpty')}</p>;
  }

  return (
    <ul className="flex flex-col gap-2" data-pf-ocr-settings-queue>
      {jobs.map((job) => (
        <li
          key={job.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2"
          data-pf-ocr-job-status={job.status}
        >
          <div className="min-w-0">
            <p className="truncate text-sm">{job.filename ?? job.id.slice(0, 8)}</p>
            <p className="text-xs text-[var(--pf-text-secondary)]">{t(`status.${job.status}`)}</p>
          </div>
          {canManageDocuments ? (
            <div className="flex flex-wrap gap-2">
              {job.status === 'failed' && job.documentId ? (
                <Button
                  type="button"
                  className="min-h-11"
                  loading={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await extractReceiptAction({
                        documentId: job.documentId,
                        filename: job.filename ?? undefined,
                        forceRetry: true,
                      });
                      router.refresh();
                    })
                  }
                >
                  {t('retry')}
                </Button>
              ) : null}
              {job.status === 'queued' ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  loading={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await cancelOcrJobAction({ jobId: job.id });
                      router.refresh();
                    })
                  }
                >
                  {t('cancelJob')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

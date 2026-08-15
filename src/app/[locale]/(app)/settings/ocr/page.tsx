import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { textNavLinkClassName } from '@/components/ui/pressable';
import {
  azureOcrNeedsKeyAndEndpoint,
  getOcrQueueSnapshot,
  isOcrIngestionFlagOn,
  isOcrReviewUiAllowed,
  readOcrProviderStatus,
} from '@/modules/ocr';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { canAccessSection, SETTINGS_SECTIONS } from '../_lib/access';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { OcrQueueActions } from './ocr-queue-actions';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('ocr');
}

export default async function OcrSettingsPage() {
  const t = await getTranslations('settings.ocr');
  const tOcr = await getTranslations('documents.ocr');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'ocr')!;

  const data = await withOrgContext(async (context) => {
    if (!canAccessSection(context, section)) return { allowed: false as const };

    const status = readOcrProviderStatus();
    let queue = { queued: 0, processing: 0, failed: 0, needsReview: 0, jobs: [] as Awaited<
      ReturnType<typeof getOcrQueueSnapshot>
    >['jobs'] };
    try {
      queue = await getOcrQueueSnapshot(context);
    } catch {
      queue = { queued: 0, processing: 0, failed: 0, needsReview: 0, jobs: [] };
    }

    return {
      allowed: true as const,
      status,
      ingestionFlagOn: isOcrIngestionFlagOn(),
      azureNeedsCredentials: azureOcrNeedsKeyAndEndpoint(status),
      reviewAllowed: isOcrReviewUiAllowed(),
      canManageDocuments: hasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE),
      queue,
    };
  });

  if (!data.allowed) {
    return (
      <SettingsPageShell title={t('title')}>
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  const actionableJobs = data.queue.jobs
    .filter(
      (job) =>
        job.status === 'queued' ||
        job.status === 'running' ||
        job.status === 'processing' ||
        job.status === 'failed',
    )
    .map((job) => ({
      id: job.id,
      status: job.status as 'queued' | 'running' | 'processing' | 'failed',
      filename: job.sourceDocument.filename,
      documentId: job.sourceDocument.documentId,
    }));

  return (
    <SettingsPageShell title={t('title')} description={t('description')}>
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 p-5">
          <p className="text-sm">
            <span className="font-medium">{t('ingestionLabel')}: </span>
            {data.ingestionFlagOn ? t('ingestionOn') : t('ingestionOff')}
          </p>
          <p className="text-sm">
            <span className="font-medium">{t('providerLabel')}: </span>
            {data.status.providerId}
            {data.status.configured ? ` · ${t('providerConfigured')}` : ` · ${t('providerMissing')}`}
          </p>
          <Alert tone={data.status.featureMode === 'live' ? 'info' : 'warning'}>
            <p className="font-medium">{tOcr(`configurationState.${data.status.featureMode}`)}</p>
            <p>{tOcr(data.status.messageKey)}</p>
          </Alert>
          {data.azureNeedsCredentials ? (
            <Alert tone="warning">{t('azureGuidance')}</Alert>
          ) : null}
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('draftsOnly')}</p>
        </Card>

        <Card className="flex flex-col gap-3 p-5">
          <h2 className="text-base font-semibold">{t('queueTitle')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('queueHint')}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4" data-pf-ocr-queue-counts>
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('queued')}</dt>
              <dd className="text-lg font-semibold">{data.queue.queued}</dd>
            </div>
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('processing')}</dt>
              <dd className="text-lg font-semibold">{data.queue.processing}</dd>
            </div>
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('needsReview')}</dt>
              <dd className="text-lg font-semibold">{data.queue.needsReview}</dd>
            </div>
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('failed')}</dt>
              <dd className="text-lg font-semibold">{data.queue.failed}</dd>
            </div>
          </dl>
          <OcrQueueActions jobs={actionableJobs} canManageDocuments={data.canManageDocuments} />
          {data.reviewAllowed ? (
            <Link
              href="/documents/ocr-review"
              className={cn(textNavLinkClassName, 'rounded-sm text-sm font-medium')}
            >
              {t('reviewLink')}
            </Link>
          ) : null}
        </Card>
      </div>
    </SettingsPageShell>
  );
}

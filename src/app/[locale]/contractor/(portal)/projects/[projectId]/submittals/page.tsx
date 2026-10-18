import { FileCheck2 } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/ui/empty-state';
import { requireExternalContext } from '@/modules/contractor-access';
import {
  portalPageHeaderClass,
  portalPageStackClass,
  portalPageSubtitleClass,
  portalPageTitleClass,
  portalPrimaryButtonClass,
  portalStatChipClass,
  portalWideListClass,
} from '@/modules/contractor-portal/ui/portal-surface';
import { listProjectLocationOptions, listProjectWorkPackageOptions } from '@/modules/rfi';
import { getContractorSubmittalSummary, listContractorSubmittals } from '@/modules/submittals';
import { ContractorSubmittalCreateForm } from '@/modules/submittals/ui/contractor-submittal-create-form';
import { SubmittalList } from '@/modules/submittals/ui/submittal-list';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import { Link } from '@/shared/i18n/navigation';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorSubmittalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { projectId } = await params;
  const { new: newParam } = await searchParams;
  const context = await requireExternalContext();
  const grant = context.grants.find(
    (g) =>
      g.capabilities.has(EXTERNAL_CAPABILITIES.SUBMITTAL_SUBMIT) &&
      (!g.projectId || g.projectId === projectId),
  );
  if (!grant) notFound();

  const organizationId = grant.organizationId;
  const wantsCreate = newParam === '1';
  const base = `/contractor/projects/${projectId}/submittals`;

  const [items, summary, locations, workPackages] = await Promise.all([
    listContractorSubmittals(context, { organizationId, projectId }),
    getContractorSubmittalSummary(context, { organizationId, projectId }),
    listProjectLocationOptions(context.db, organizationId, projectId),
    listProjectWorkPackageOptions(context.db, organizationId, projectId),
  ]);

  const [t, locale] = await Promise.all([getTranslations('submittals'), getLocale()]);

  return (
    <div className={portalPageStackClass}>
      <header className={portalPageHeaderClass}>
        <h1 className={portalPageTitleClass}>{t('portal.title')}</h1>
        <p className={portalPageSubtitleClass}>{t('portal.description')}</p>
      </header>

      <div className="flex flex-wrap gap-2">
        {summary.pendingReview > 0 ? (
          <span className={portalStatChipClass}>
            {t('summary.pendingReview')}: <strong className="tabular-nums">{summary.pendingReview}</strong>
          </span>
        ) : null}
        {summary.actionRequired > 0 ? (
          <span className={portalStatChipClass}>
            {t('summary.actionRequired')}: <strong className="tabular-nums">{summary.actionRequired}</strong>
          </span>
        ) : null}
      </div>

      {wantsCreate ? (
        <WithPortalClientMessages extra={['submittals', 'common']}>
          <ContractorSubmittalCreateForm
            organizationId={organizationId}
            projectId={projectId}
            basePath={base}
            locations={locations}
            workPackages={workPackages}
          />
        </WithPortalClientMessages>
      ) : (
        <Link href={`${base}?new=1`} className={portalPrimaryButtonClass}>
          {t('create.contractorTitle')}
        </Link>
      )}

      {items.length === 0 ? (
        <EmptyState icon={FileCheck2} title={t('portal.empty')} size="sm" />
      ) : (
        <div className={portalWideListClass}>
          <SubmittalList items={items} basePath={base} locale={locale} />
        </div>
      )}
    </div>
  );
}

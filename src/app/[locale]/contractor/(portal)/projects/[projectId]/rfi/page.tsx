import { MessageCircleQuestion } from 'lucide-react';
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
import { getContractorRfiSummary, listContractorRfis, listProjectLocationOptions, listProjectWorkPackageOptions } from '@/modules/rfi';
import { ContractorRfiCreateForm } from '@/modules/rfi/ui/contractor-rfi-create-form';
import { RfiList } from '@/modules/rfi/ui/rfi-list';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import { Link } from '@/shared/i18n/navigation';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorRfisPage({
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
      g.capabilities.has(EXTERNAL_CAPABILITIES.RFI_RAISE) &&
      (!g.projectId || g.projectId === projectId),
  );
  if (!grant) notFound();

  const organizationId = grant.organizationId;
  const wantsCreate = newParam === '1';
  const base = `/contractor/projects/${projectId}/rfi`;

  const [items, summary, locations, workPackages] = await Promise.all([
    listContractorRfis(context, { organizationId, projectId }),
    getContractorRfiSummary(context, { organizationId, projectId }),
    listProjectLocationOptions(context.db, organizationId, projectId),
    listProjectWorkPackageOptions(context.db, organizationId, projectId),
  ]);

  const [t, locale] = await Promise.all([getTranslations('rfi'), getLocale()]);

  return (
    <WithPortalClientMessages extra={['rfi', 'common']}>
      <div className={portalPageStackClass}>
        <header className={portalPageHeaderClass}>
          <h1 className={portalPageTitleClass}>{t('portal.title')}</h1>
          <p className={portalPageSubtitleClass}>{t('portal.description')}</p>
        </header>

        <div className="flex flex-wrap gap-2">
          <BadgeStat label={t('summary.awaitingAnswer')} value={summary.awaitingAnswer} />
          <BadgeStat label={t('summary.overdue')} value={summary.overdue} />
          <BadgeStat label={t('summary.drafts')} value={summary.drafts} />
        </div>

        {wantsCreate ? (
          <ContractorRfiCreateForm
            organizationId={organizationId}
            projectId={projectId}
            basePath={base}
            locations={locations}
            workPackages={workPackages}
          />
        ) : (
          <Link href={`${base}?new=1`} className={portalPrimaryButtonClass}>
            {t('portal.newTitle')}
          </Link>
        )}

        {items.length === 0 ? (
          <EmptyState icon={MessageCircleQuestion} title={t('portal.empty')} size="sm" />
        ) : (
          <div className={portalWideListClass}>
            <RfiList items={items} basePath={base} locale={locale} />
          </div>
        )}
      </div>
    </WithPortalClientMessages>
  );
}

function BadgeStat({ label, value }: { label: string; value: number }) {
  if (value === 0) return null;
  return (
    <span className={portalStatChipClass}>
      {label}: <strong className="tabular-nums">{value}</strong>
    </span>
  );
}

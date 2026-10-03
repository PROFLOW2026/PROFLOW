import { FileCheck2 } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { requireExternalContext } from '@/modules/contractor-access';
import { listProjectLocationOptions, listProjectWorkPackageOptions } from '@/modules/rfi';
import { getContractorSubmittalSummary, listContractorSubmittals } from '@/modules/submittals';
import { ContractorSubmittalCreateForm } from '@/modules/submittals/ui/contractor-submittal-create-form';
import { SubmittalList } from '@/modules/submittals/ui/submittal-list';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import { Link } from '@/shared/i18n/navigation';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

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
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader title={t('portal.title')} description={t('portal.description')} />

      <div className="flex flex-wrap gap-2 text-sm">
        {summary.pendingReview > 0 ? (
          <span className="rounded-md bg-[var(--pf-bg-muted)] px-3 py-1.5">
            {t('summary.pendingReview')}: <strong>{summary.pendingReview}</strong>
          </span>
        ) : null}
        {summary.actionRequired > 0 ? (
          <span className="rounded-md bg-[var(--pf-bg-muted)] px-3 py-1.5">
            {t('summary.actionRequired')}: <strong>{summary.actionRequired}</strong>
          </span>
        ) : null}
      </div>

      {wantsCreate ? (
        <WithClientMessages extra={['submittals', 'common']}>
          <ContractorSubmittalCreateForm
            organizationId={organizationId}
            projectId={projectId}
            basePath={base}
            locations={locations}
            workPackages={workPackages}
          />
        </WithClientMessages>
      ) : (
        <Link href={`${base}?new=1`} className={buttonVariants({ variant: 'primary' })}>
          {t('create.contractorTitle')}
        </Link>
      )}

      {items.length === 0 ? (
        <EmptyState icon={FileCheck2} title={t('portal.empty')} size="sm" />
      ) : (
        <SubmittalList items={items} basePath={base} locale={locale} />
      )}
    </div>
  );
}

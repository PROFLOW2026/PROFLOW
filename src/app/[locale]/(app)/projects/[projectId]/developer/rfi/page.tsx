import { MessageCircleQuestion } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { requireConnectedDeveloperSession } from '@/modules/connected-projects';
import { getContractorRfiSummary, listContractorRfis, listProjectLocationOptions, listProjectWorkPackageOptions } from '@/modules/rfi';
import { ContractorRfiCreateForm } from '@/modules/rfi/ui/contractor-rfi-create-form';
import { RfiList } from '@/modules/rfi/ui/rfi-list';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import { Link } from '@/shared/i18n/navigation';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ConnectedDeveloperRfiPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { projectId: contractorProjectId } = await params;
  const { new: newParam } = await searchParams;
  const session = await requireConnectedDeveloperSession(contractorProjectId, {
    anyOf: [EXTERNAL_CAPABILITIES.RFI_VIEW, EXTERNAL_CAPABILITIES.RFI_RAISE],
  });

  const organizationId = session.developer.organizationId;
  const developerProjectId = session.developer.projectId;
  const canRaise = session.capabilities.has(EXTERNAL_CAPABILITIES.RFI_RAISE);
  if (!canRaise && newParam === '1') notFound();

  const wantsCreate = newParam === '1' && canRaise;
  const base = `/projects/${contractorProjectId}/developer/rfi`;
  const portalRfiBase = `/contractor/projects/${developerProjectId}/rfi`;

  const [items, summary, locations, workPackages, t, locale] = await Promise.all([
    listContractorRfis(session.externalContext, { organizationId, projectId: developerProjectId }),
    getContractorRfiSummary(session.externalContext, { organizationId, projectId: developerProjectId }),
    listProjectLocationOptions(session.externalContext.db, organizationId, developerProjectId),
    listProjectWorkPackageOptions(session.externalContext.db, organizationId, developerProjectId),
    getTranslations('rfi'),
    getLocale(),
  ]);

  return (
    <WithPortalClientMessages extra={['rfi', 'common']}>
      <div className="flex flex-col gap-4 pb-6">
        <PageHeader title={t('portal.title')} description={t('portal.description')} />
        <div className="flex flex-wrap gap-2 text-sm">
          <BadgeStat label={t('summary.awaitingAnswer')} value={summary.awaitingAnswer} />
          <BadgeStat label={t('summary.overdue')} value={summary.overdue} />
          <BadgeStat label={t('summary.drafts')} value={summary.drafts} />
        </div>
        {canRaise ? (
          wantsCreate ? (
            <ContractorRfiCreateForm
              organizationId={organizationId}
              projectId={developerProjectId}
              basePath={base}
              locations={locations}
              workPackages={workPackages}
            />
          ) : (
            <Link href={`${base}?new=1`} className={buttonVariants({ variant: 'primary' })}>
              {t('portal.newTitle')}
            </Link>
          )
        ) : null}
        {items.length === 0 ? (
          <EmptyState icon={MessageCircleQuestion} title={t('portal.empty')} size="sm" />
        ) : (
          <RfiList items={items} basePath={portalRfiBase} locale={locale} />
        )}
      </div>
    </WithPortalClientMessages>
  );
}

function BadgeStat({ label, value }: { label: string; value: number }) {
  if (value === 0) return null;
  return (
    <span className="rounded-md bg-[var(--pf-bg-muted)] px-3 py-1.5">
      {label}: <strong>{value}</strong>
    </span>
  );
}

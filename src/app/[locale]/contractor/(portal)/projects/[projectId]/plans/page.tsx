import { Map as MapIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/ui/empty-state';
import { requireExternalContext } from '@/modules/contractor-access';
import { listContractorSemanticFolder } from '@/modules/contractor-portal/application/contractor-folder-files';
import { ContractorFolderFilesPanel } from '@/modules/contractor-portal/ui/contractor-folder-files-panel';
import {
  portalPageHeaderClass,
  portalPageStackClass,
  portalPageSubtitleClass,
  portalPageTitleClass,
} from '@/modules/contractor-portal/ui/portal-surface';
import { listContractorPlans } from '@/modules/project-plans';
import { ContractorPlansList } from '@/modules/project-plans/ui/contractor-plans-list';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';

export default async function ContractorPlansPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ folder?: string; sf?: string }>;
}) {
  const { projectId } = await params;
  const { folder: folderExternalId, sf } = await searchParams;
  const drillFolderId = !sf || sf === 'plans' ? (folderExternalId ?? null) : null;
  const context = await requireExternalContext();
  const planGrants = context.grants.filter(
    (g) =>
      g.capabilities.has(EXTERNAL_CAPABILITIES.PLAN_VIEW) &&
      (g.projectId === projectId || g.projectId === null),
  );
  if (planGrants.length === 0) notFound();

  const organizationIds = [...new Set(planGrants.map((g) => g.organizationId))];
  const sections = await Promise.all(
    organizationIds.map(async (organizationId) => {
      const [plans, folderListing] = await Promise.all([
        listContractorPlans(context, { organizationId, projectId }),
        listContractorSemanticFolder(context, {
          organizationId,
          projectId,
          folder: 'plans',
          folderExternalId: drillFolderId,
        }).catch(() => null),
      ]);
      return { organizationId, drawings: plans.items, folderListing };
    }),
  );

  const byDrawing = new Map(
    sections.flatMap((section) => section.drawings).map((item) => [item.drawingId, item] as const),
  );
  const drawings = [...byDrawing.values()];
  const folderSections = sections.filter((section) => section.folderListing != null);
  const folderFileCount = folderSections.reduce(
    (n, section) => n + (section.folderListing?.files.length ?? 0) + (section.folderListing?.subfolders.length ?? 0),
    0,
  );
  const t = await getTranslations('projectPlans.portal.plans');
  const tFolder = await getTranslations('contractorPortal.folderFiles');

  const empty = drawings.length === 0 && folderFileCount === 0;

  return (
    <div className={portalPageStackClass}>
      <header className={portalPageHeaderClass}>
        <h1 className={portalPageTitleClass}>{t('pageTitle')}</h1>
        <p className={portalPageSubtitleClass}>{t('pageDescription')}</p>
      </header>
      {empty ? (
        <EmptyState icon={MapIcon} title={t('emptyTitle')} size="sm" />
      ) : (
        <div className="flex flex-col gap-8">
          {folderSections.map((section) =>
            section.folderListing &&
            (section.folderListing.files.length > 0 || section.folderListing.subfolders.length > 0) ? (
              <section key={`folder-${section.organizationId}`} className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-[var(--pf-text-primary)]">{tFolder('plansSection')}</h2>
                <ContractorFolderFilesPanel
                  organizationId={section.organizationId}
                  projectId={projectId}
                  listing={section.folderListing}
                />
              </section>
            ) : null,
          )}
          {drawings.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-[var(--pf-text-primary)]">{tFolder('registerSection')}</h2>
              <ContractorPlansList projectId={projectId} items={drawings} />
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

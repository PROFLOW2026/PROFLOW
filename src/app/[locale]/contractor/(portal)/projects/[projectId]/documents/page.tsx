import { FileText } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/ui/empty-state';
import { requireExternalContext } from '@/modules/contractor-access';
import {
  listContractorAllowedFolderRoots,
  listContractorSemanticFolder,
} from '@/modules/contractor-portal/application/contractor-folder-files';
import {
  CONTRACTOR_PORTAL_FILE_FOLDERS,
  type ContractorPortalFileFolder,
} from '@/modules/contractor-portal/domain/folder-capabilities';
import { ContractorFolderFilesPanel } from '@/modules/contractor-portal/ui/contractor-folder-files-panel';
import {
  portalPageHeaderClass,
  portalPageStackClass,
  portalPageSubtitleClass,
  portalPageTitleClass,
} from '@/modules/contractor-portal/ui/portal-surface';
import { listContractorSharedDocuments } from '@/modules/project-plans';
import { ContractorDocumentsList } from '@/modules/project-plans/ui/contractor-documents-list';
import { FOLDER_EXTERNAL_CAPABILITIES, EXTERNAL_CAPABILITIES } from '@/shared/external';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';

const FOLDER_SECTION_KEY: Record<ContractorPortalFileFolder, string> = {
  quotes: 'quotesSection',
  contracts: 'contractsSection',
  billing: 'billingSection',
  vendor_invoices: 'vendorInvoicesSection',
  photos: 'photosSection',
  documents: 'documentsSection',
  general_files: 'generalFilesSection',
};

export default async function ContractorDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ folder?: string; sf?: string }>;
}) {
  const { projectId } = await params;
  const { folder: folderExternalId, sf } = await searchParams;
  const context = await requireExternalContext();

  const accessCaps = new Set<string>([
    EXTERNAL_CAPABILITIES.DOCUMENT_VIEW,
    ...FOLDER_EXTERNAL_CAPABILITIES,
  ]);
  const accessGrants = context.grants.filter(
    (g) =>
      (g.projectId === projectId || g.projectId === null) &&
      [...g.capabilities].some((cap) => accessCaps.has(cap)),
  );
  if (accessGrants.length === 0) notFound();

  const organizationIds = [...new Set(accessGrants.map((g) => g.organizationId))];
  const canViewShares = context.grants.some(
    (g) =>
      g.capabilities.has(EXTERNAL_CAPABILITIES.DOCUMENT_VIEW) &&
      (g.projectId === projectId || g.projectId === null),
  );

  const sections = await Promise.all(
    organizationIds.map(async (organizationId) => {
      const allowed = await listContractorAllowedFolderRoots(context, organizationId, projectId);
      const allowedFileFolders = allowed
        .map((entry) => entry.folder)
        .filter((folder): folder is ContractorPortalFileFolder =>
          (CONTRACTOR_PORTAL_FILE_FOLDERS as readonly string[]).includes(folder),
        );

      const folderListings = await Promise.all(
        allowedFileFolders.map(async (folder) => {
          const listing = await listContractorSemanticFolder(context, {
            organizationId,
            projectId,
            folder,
            folderExternalId: sf === folder ? (folderExternalId ?? null) : null,
          }).catch(() => null);
          return { folder, listing };
        }),
      );

      const shared = canViewShares
        ? await listContractorSharedDocuments(context, { organizationId, projectId })
        : { items: [] as const };

      return {
        organizationId,
        items: shared.items,
        folderListings: folderListings.filter(
          (entry) =>
            entry.listing &&
            (entry.listing.files.length > 0 || entry.listing.subfolders.length > 0),
        ),
      };
    }),
  );

  const totalShared = sections.reduce((n, section) => n + section.items.length, 0);
  const totalFolder = sections.reduce((n, section) => n + section.folderListings.length, 0);
  const t = await getTranslations('projectPlans.portal.documents');
  const tFolder = await getTranslations('contractorPortal.folderFiles');

  return (
    <div className={portalPageStackClass}>
      <header className={portalPageHeaderClass}>
        <h1 className={portalPageTitleClass}>{t('pageTitle')}</h1>
        <p className={portalPageSubtitleClass}>{t('pageDescription')}</p>
      </header>
      {totalShared === 0 && totalFolder === 0 ? (
        <EmptyState icon={FileText} title={t('emptyTitle')} size="sm" />
      ) : (
        <WithPortalClientMessages extra={['projectPlans']}>
          <div className="flex flex-col gap-8">
            {sections.map((section) => (
              <div key={section.organizationId} className="flex flex-col gap-6">
                {section.folderListings.map((entry) =>
                  entry.listing ? (
                    <section key={`${section.organizationId}-${entry.folder}`} className="flex flex-col gap-3">
                      <h2 className="text-sm font-semibold text-[var(--pf-text-primary)]">
                        {tFolder(FOLDER_SECTION_KEY[entry.folder])}
                      </h2>
                      <ContractorFolderFilesPanel
                        organizationId={section.organizationId}
                        projectId={projectId}
                        listing={entry.listing}
                      />
                    </section>
                  ) : null,
                )}
                {section.items.length > 0 ? (
                  <ContractorDocumentsList
                    organizationId={section.organizationId}
                    projectId={projectId}
                    items={section.items}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </WithPortalClientMessages>
      )}
    </div>
  );
}

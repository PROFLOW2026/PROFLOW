import { FileText } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/ui/empty-state';
import { requireExternalContext } from '@/modules/contractor-access';
import {
  portalPageHeaderClass,
  portalPageStackClass,
  portalPageSubtitleClass,
  portalPageTitleClass,
} from '@/modules/contractor-portal/ui/portal-surface';
import { listContractorSharedDocuments } from '@/modules/project-plans';
import { ContractorDocumentsList } from '@/modules/project-plans/ui/contractor-documents-list';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorDocumentsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const context = await requireExternalContext();
  const documentGrants = context.grants.filter(
    (g) =>
      g.capabilities.has(EXTERNAL_CAPABILITIES.DOCUMENT_VIEW) &&
      (g.projectId === projectId || g.projectId === null),
  );
  if (documentGrants.length === 0) notFound();

  const organizationIds = [...new Set(documentGrants.map((g) => g.organizationId))];
  const sections = await Promise.all(
    organizationIds.map(async (organizationId) => {
      const listed = await listContractorSharedDocuments(context, {
        organizationId,
        projectId,
      });
      return { organizationId, items: listed.items };
    }),
  );

  const totalItems = sections.reduce((n, section) => n + section.items.length, 0);
  const t = await getTranslations('projectPlans.portal.documents');

  return (
    <div className={portalPageStackClass}>
      <header className={portalPageHeaderClass}>
        <h1 className={portalPageTitleClass}>{t('pageTitle')}</h1>
        <p className={portalPageSubtitleClass}>{t('pageDescription')}</p>
      </header>
      {totalItems === 0 ? (
        <EmptyState icon={FileText} title={t('emptyTitle')} size="sm" />
      ) : (
        <WithPortalClientMessages extra={['projectPlans']}>
          <div className="flex flex-col gap-5">
            {sections.map((section) =>
              section.items.length === 0 ? null : (
                <ContractorDocumentsList
                  key={section.organizationId}
                  organizationId={section.organizationId}
                  projectId={projectId}
                  items={section.items}
                />
              ),
            )}
          </div>
        </WithPortalClientMessages>
      )}
    </div>
  );
}

import { FileText } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { requireConnectedDeveloperSession } from '@/modules/connected-projects';
import { ConnectedDeveloperDocumentsList } from '@/modules/connected-projects/ui';
import { getOrganizationPrimaryStorage } from '@/modules/external-storage/server';
import { listContractorSharedDocuments } from '@/modules/project-plans';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import { withOrgContext } from '@/shared/auth/session';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ConnectedDeveloperDocumentsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId: contractorProjectId } = await params;
  const session = await requireConnectedDeveloperSession(contractorProjectId, EXTERNAL_CAPABILITIES.DOCUMENT_VIEW);

  const developerProjectId = session.developer.projectId;
  const listed = await listContractorSharedDocuments(session.externalContext, {
    organizationId: session.developer.organizationId,
    projectId: developerProjectId,
  });

  const storage = await withOrgContext((org) => getOrganizationPrimaryStorage(org));
  const showSaveCopyAction = Boolean(storage && storage.status === 'connected');

  const t = await getTranslations('projectPlans.portal.documents');

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader title={t('pageTitle')} description={t('pageDescription')} />
      {listed.items.length === 0 ? (
        <EmptyState icon={FileText} title={t('emptyTitle')} size="sm" />
      ) : (
        <WithPortalClientMessages extra={['projectPlans', 'projects']}>
          <ConnectedDeveloperDocumentsList
            contractorProjectId={contractorProjectId}
            developerOrganizationId={session.developer.organizationId}
            developerProjectId={developerProjectId}
            items={listed.items}
            showSaveCopyAction={showSaveCopyAction}
          />
        </WithPortalClientMessages>
      )}
    </div>
  );
}

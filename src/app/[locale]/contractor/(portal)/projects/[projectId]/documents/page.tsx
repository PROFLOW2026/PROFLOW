import { FileText } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { requireExternalContext } from '@/modules/contractor-access';
import { listContractorSharedDocuments } from '@/modules/project-plans';
import { ContractorDocumentsList } from '@/modules/project-plans/ui/contractor-documents-list';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorDocumentsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const context = await requireExternalContext();
  const grant = context.grants.find(
    (g) =>
      g.capabilities.has(EXTERNAL_CAPABILITIES.DOCUMENT_VIEW) &&
      (g.projectId === projectId || g.projectId === null),
  );
  if (!grant) notFound();

  const listed = await listContractorSharedDocuments(context, {
    organizationId: grant.organizationId,
    projectId,
  });
  const t = await getTranslations('projectPlans.portal.documents');

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader title={t('pageTitle')} description={t('pageDescription')} />
      {listed.items.length === 0 ? (
        <EmptyState icon={FileText} title={t('emptyTitle')} size="sm" />
      ) : (
        <WithClientMessages extra={['projectPlans']}>
          <ContractorDocumentsList organizationId={grant.organizationId} projectId={projectId} items={listed.items} />
        </WithClientMessages>
      )}
    </div>
  );
}

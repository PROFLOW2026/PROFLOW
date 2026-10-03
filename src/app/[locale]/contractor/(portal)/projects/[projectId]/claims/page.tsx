import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { requireExternalContext } from '@/modules/contractor-access';
import {
  listContractorProjectClaims,
  resolveContractorClaimsOrganization,
} from '@/modules/subcontract-claims';
import { ClaimsList } from '@/modules/subcontract-claims/ui/claims-list';
import { loadOrNotFound } from '@/modules/subcontract-claims/ui/page-guard';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorClaimsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const t = await getTranslations('subcontractClaims');
  const context = await requireExternalContext();
  const organizationId = await loadOrNotFound(() => resolveContractorClaimsOrganization(context, projectId));
  const items = await loadOrNotFound(() => listContractorProjectClaims(context, organizationId, projectId));
  const basePath = `/contractor/projects/${projectId}/claims`;

  return (
    <WithClientMessages extra={['subcontractClaims']}>
      <div className="flex flex-col gap-4 pb-6">
        <PageHeader title={t('portal.claimsTitle')} />
        <ClaimsList items={items} basePath={basePath} />
      </div>
    </WithClientMessages>
  );
}

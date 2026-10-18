import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { requireExternalContext } from '@/modules/contractor-access';
import {
  listContractorClaimAgreements,
  listContractorProjectClaims,
  resolveContractorClaimsOrganization,
} from '@/modules/subcontract-claims';
import { claimShowsNetAmount } from '@/modules/contractor-portal/application/providers/claims';
import { ClaimsList } from '@/modules/subcontract-claims/ui/claims-list';
import { portalWideListClass } from '@/modules/contractor-portal/ui/portal-surface';
import { PortalCreateClaimForm } from '@/modules/subcontract-claims/ui/portal-create-claim-form';
import { loadOrNotFound } from '@/modules/subcontract-claims/ui/page-guard';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorClaimsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const t = await getTranslations('subcontractClaims');
  const context = await requireExternalContext();
  const organizationId = await loadOrNotFound(() => resolveContractorClaimsOrganization(context, projectId));
  const items = await loadOrNotFound(() => listContractorProjectClaims(context, organizationId, projectId));
  const displayItems = items.map((item) => ({
    ...item,
    showAmounts: claimShowsNetAmount(context, organizationId, item),
  }));
  const agreements = await loadOrNotFound(() => listContractorClaimAgreements(context, organizationId, projectId));
  const basePath = `/contractor/projects/${projectId}/claims`;

  return (
    <WithPortalClientMessages extra={['subcontractClaims']}>
      <div className="flex flex-col gap-4 pb-6">
        <PageHeader title={t('portal.claimsTitle')} />
        <PortalCreateClaimForm organizationId={organizationId} projectId={projectId} agreements={agreements} />
        <div className={portalWideListClass}>
          <ClaimsList items={displayItems} basePath={basePath} />
        </div>
      </div>
    </WithPortalClientMessages>
  );
}

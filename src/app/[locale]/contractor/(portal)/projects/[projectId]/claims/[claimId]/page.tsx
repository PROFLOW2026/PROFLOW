import { getTranslations } from 'next-intl/server';
import { requireExternalContext } from '@/modules/contractor-access';
import {
  getContractorClaimDetail,
  resolveContractorClaimsOrganization,
} from '@/modules/subcontract-claims';
import { loadOrNotFound } from '@/modules/subcontract-claims/ui/page-guard';
import { PortalClaimDetail } from '@/modules/subcontract-claims/ui/portal-claim-detail';
import { Link } from '@/shared/i18n/navigation';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorClaimDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; claimId: string }>;
}) {
  const { projectId, claimId } = await params;
  const t = await getTranslations('subcontractClaims');
  const context = await requireExternalContext();
  const organizationId = await loadOrNotFound(() => resolveContractorClaimsOrganization(context, projectId));
  const view = await loadOrNotFound(() => getContractorClaimDetail(context, organizationId, projectId, claimId));

  return (
    <WithPortalClientMessages extra={['subcontractClaims']}>
      <Link href={`/contractor/projects/${projectId}/claims`} className="text-sm text-[var(--pf-text-brand)] hover:underline">
        ← {t('portal.claimsTitle')}
      </Link>
      <PortalClaimDetail organizationId={organizationId} projectId={projectId} view={view} />
    </WithPortalClientMessages>
  );
}

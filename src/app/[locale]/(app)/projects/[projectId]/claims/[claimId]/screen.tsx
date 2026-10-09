import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { getClaimDetail } from '@/modules/subcontract-claims';
import { ClaimDetailPanel } from '@/modules/subcontract-claims/ui/claim-detail-panel';
import { loadOrNotFound } from '@/modules/subcontract-claims/ui/page-guard';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export async function ProjectClaimDetailScreen({ surfaceRoot,
  params,
}: {
    surfaceRoot?: string;

  params: Promise<{ projectId: string; claimId: string }>;
}) {
  const { projectId, claimId } = await params;
  await requireProjectCapabilityPage(projectId, 'claim.view');
  const t = await getTranslations('subcontractClaims');
  const basePath = `${surfaceRoot ?? ('/projects/' + projectId)}/claims`;

  const view = await loadOrNotFound(() => withOrgContext((context) => getClaimDetail(context, projectId, claimId)));

  return (
    <WithAppClientMessages extra={['subcontractClaims']}>
      <div className="flex flex-col gap-4">
        <Link href={basePath} className="text-sm text-[var(--pf-text-brand)] hover:underline">
          ← {t('list.pageTitle')}
        </Link>
        <PageHeader title={`CLM-${view.detail.header.claimNumber}`} />
        <ClaimDetailPanel projectId={projectId} view={view} basePath={basePath} />
      </div>
    </WithAppClientMessages>
  );
}

export default function ProjectClaimDetailPage(
  props: Omit<Parameters<typeof ProjectClaimDetailScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectClaimDetailScreen {...props} />;
}

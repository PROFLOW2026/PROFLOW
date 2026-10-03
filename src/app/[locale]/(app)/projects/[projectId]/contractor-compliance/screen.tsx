import { ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { getProjectComplianceOverview } from '@/modules/contractor-compliance';
import { ApplyStandardSetButton } from '@/modules/contractor-compliance/ui/apply-standard-set-button';
import { ComplianceAgreementList } from '@/modules/contractor-compliance/ui/compliance-agreement-list';
import { ComplianceReviewActions } from '@/modules/contractor-compliance/ui/compliance-review-actions';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { withOrgContext } from '@/shared/auth/session';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export async function ProjectContractorComplianceScreen({ surfaceRoot: _surfaceRoot,
  params,
}: {
    surfaceRoot?: string;

  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.CONTRACTOR_VIEW);
  const t = await getTranslations('contractorCompliance');

  const overview = await withOrgContext((context) => getProjectComplianceOverview(context, projectId));

  const agreementIds = overview.agreements.map((a) => a.agreementId);

  return (
    <WithClientMessages extra={['contractorCompliance']}>
      <div className="flex flex-col gap-6">
        <PageHeader title={t('title')} description={t('description')} />

        {overview.canManage ? <ApplyStandardSetButton projectId={projectId} agreementIds={agreementIds} /> : null}

        {overview.pendingReviews.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-[var(--pf-text-primary)]">{t('review.queueTitle')}</h2>
            {overview.pendingReviews.map((pending) => (
              <ComplianceReviewActions
                key={pending.id}
                projectId={projectId}
                documentId={pending.id}
                requirementTitle={`${pending.vendorName} · ${pending.requirementTitle}`}
              />
            ))}
          </section>
        ) : null}

        {overview.agreements.length === 0 ? (
          <EmptyState icon={ShieldCheck} title={t('empty.title')} description={t('empty.description')} />
        ) : (
          <ComplianceAgreementList overview={overview} />
        )}
      </div>
    </WithClientMessages>
  );
}

export default function ProjectContractorCompliancePage(
  props: Omit<Parameters<typeof ProjectContractorComplianceScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectContractorComplianceScreen {...props} />;
}

import { Map } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { requireConnectedDeveloperSession } from '@/modules/connected-projects';
import { listContractorPlans } from '@/modules/project-plans';
import { ContractorPlansList } from '@/modules/project-plans/ui/contractor-plans-list';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';

export default async function ConnectedDeveloperPlansPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId: contractorProjectId } = await params;
  const session = await requireConnectedDeveloperSession(contractorProjectId, EXTERNAL_CAPABILITIES.PLAN_VIEW);

  const developerProjectId = session.developer.projectId;
  const plans = await listContractorPlans(session.externalContext, {
    organizationId: session.developer.organizationId,
    projectId: developerProjectId,
  });
  const t = await getTranslations('projectPlans.portal.plans');

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader title={t('pageTitle')} description={t('pageDescription')} />
      {plans.items.length === 0 ? (
        <EmptyState icon={Map} title={t('emptyTitle')} size="sm" />
      ) : (
        <ContractorPlansList projectId={developerProjectId} items={plans.items} />
      )}
    </div>
  );
}

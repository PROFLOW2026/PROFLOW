import { Map } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { requireExternalContext } from '@/modules/contractor-access';
import { listContractorPlans } from '@/modules/project-plans';
import { ContractorPlansList } from '@/modules/project-plans/ui/contractor-plans-list';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';

export default async function ContractorPlansPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const context = await requireExternalContext();
  const grant = context.grants.find(
    (g) => g.capabilities.has(EXTERNAL_CAPABILITIES.PLAN_VIEW) && (g.projectId === projectId || g.projectId === null),
  );
  if (!grant) notFound();

  const plans = await listContractorPlans(context, { organizationId: grant.organizationId, projectId });
  const t = await getTranslations('projectPlans.portal.plans');

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader title={t('pageTitle')} description={t('pageDescription')} />
      {plans.items.length === 0 ? (
        <EmptyState icon={Map} title={t('emptyTitle')} size="sm" />
      ) : (
        <ContractorPlansList projectId={projectId} items={plans.items} />
      )}
    </div>
  );
}

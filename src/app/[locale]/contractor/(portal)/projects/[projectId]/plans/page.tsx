import { Map } from 'lucide-react';
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
    <div className={portalPageStackClass}>
      <header className={portalPageHeaderClass}>
        <h1 className={portalPageTitleClass}>{t('pageTitle')}</h1>
        <p className={portalPageSubtitleClass}>{t('pageDescription')}</p>
      </header>
      {plans.items.length === 0 ? (
        <EmptyState icon={Map} title={t('emptyTitle')} size="sm" />
      ) : (
        <ContractorPlansList projectId={projectId} items={plans.items} />
      )}
    </div>
  );
}

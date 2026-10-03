import { Truck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { requireExternalContext } from '@/modules/contractor-access';
import { getContractorDeliveriesSummary, listDeliveriesForPortal } from '@/modules/deliveries';
import {
  ContractorDeliveryCreateForm,
  ContractorDeliveryReportButton,
} from '@/modules/deliveries/ui/contractor-delivery-forms';
import { deliveryStateShape } from '@/modules/deliveries/ui';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorDeliveriesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const context = await requireExternalContext();
  const grant = context.grants.find(
    (g) => g.capabilities.has(EXTERNAL_CAPABILITIES.DELIVERY_REPORT) && (!g.projectId || g.projectId === projectId),
  );
  if (!grant) notFound();

  const organizationId = grant.organizationId;
  const [items, summary] = await Promise.all([
    listDeliveriesForPortal(context, { organizationId, projectId }),
    getContractorDeliveriesSummary(context, { organizationId, projectId }),
  ]);
  const t = await getTranslations('deliveries');

  return (
    <WithClientMessages extra={['deliveries']}>
      <div className="flex min-w-0 flex-col gap-4 pb-6">
        <PageHeader title={t('portal.title')} description={t('portal.description')} />

        <div className="flex flex-wrap gap-3 text-sm text-[var(--pf-text-secondary)]">
          <span>{t('portal.summaryOpen', { count: summary.open })}</span>
          <span>{t('portal.summaryDelayed', { count: summary.delayed })}</span>
        </div>

        <ContractorDeliveryCreateForm organizationId={organizationId} projectId={projectId} />

        {items.items.length === 0 ? (
          <EmptyState icon={Truck} title={t('portal.empty')} size="sm" />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.items.map((item) => (
              <li key={item.id} className="rounded-md border border-[var(--pf-border)] p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{item.itemName}</p>
                    {item.expectedDate ? (
                      <p className="text-[var(--pf-text-muted)]">{t('fields.expectedDate')}: {item.expectedDate}</p>
                    ) : null}
                  </div>
                  <StatusBadge label={t(`state.${item.state}`)} shape={deliveryStateShape(item.state, item.delayed)} />
                </div>
                <div className="mt-2">
                  <ContractorDeliveryReportButton organizationId={organizationId} projectId={projectId} item={item} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </WithClientMessages>
  );
}

import { HardHat } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { requireExternalContext } from '@/modules/contractor-access';
import { listContractorSafetyForPortal } from '@/modules/safety/contractor';
import { SafetyReportForm } from '@/modules/safety/contractor/ui/safety-report-form';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorSafetyPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const context = await requireExternalContext();
  const grant = context.grants.find(
    (g) => g.capabilities.has(EXTERNAL_CAPABILITIES.SAFETY_REPORT) && (!g.projectId || g.projectId === projectId),
  );
  if (!grant) notFound();

  const organizationId = grant.organizationId;
  const records = await listContractorSafetyForPortal(context, { organizationId, projectId });
  const t = await getTranslations('contractorCompliance');

  return (
    <WithClientMessages extra={['contractorCompliance']}>
      <div className="flex min-w-0 flex-col gap-4 pb-6">
        <PageHeader title={t('safety.portalTitle')} description={t('safety.portalDescription')} />

        <SafetyReportForm mode="portal" projectId={projectId} organizationId={organizationId} />

        {records.length === 0 ? (
          <EmptyState icon={HardHat} title={t('safety.empty')} size="sm" />
        ) : (
          <ul className="flex flex-col gap-2">
            {records.map((record) => (
              <li key={record.id} className="rounded-md border border-[var(--pf-border)] p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{record.title}</span>
                  <Badge tone="neutral">{t(`safety.types.${record.recordType}`)}</Badge>
                </div>
                <p className="mt-1 text-[var(--pf-text-secondary)]">{record.description}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </WithClientMessages>
  );
}

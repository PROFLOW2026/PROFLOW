import { ClipboardCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { requireExternalContext } from '@/modules/contractor-access';
import { listWorkPermitsForPortal } from '@/modules/work-permits';
import { workPermitStatusShape } from '@/modules/work-permits/ui/status-shape';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorWorkPermitsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const context = await requireExternalContext();
  const grant = context.grants.find(
    (g) => g.capabilities.has(EXTERNAL_CAPABILITIES.SAFETY_REPORT) && (!g.projectId || g.projectId === projectId),
  );
  if (!grant) notFound();

  const records = await listWorkPermitsForPortal(context, {
    organizationId: grant.organizationId,
    projectId,
  });
  const t = await getTranslations('workPermits');

  return (
    <WithPortalClientMessages extra={['workPermits']}>
      <div className="flex min-w-0 flex-col gap-4 pb-6">
        <PageHeader title={t('portal.title')} description={t('portal.description')} />

        {records.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title={t('portal.empty')} size="sm" />
        ) : (
          <ul className="flex flex-col gap-2">
            {records.map((record) => (
              <li key={record.id} className="rounded-md border border-[var(--pf-border)] p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{record.title}</span>
                  <StatusBadge
                    label={t(`status.${record.status}`)}
                    shape={workPermitStatusShape(record.status)}
                  />
                </div>
                <p className="mt-1 text-[var(--pf-text-secondary)]">{record.permitType}</p>
                {record.validFrom || record.validUntil ? (
                  <p className="mt-1 text-[var(--pf-text-muted)]">
                    {[record.validFrom, record.validUntil].filter(Boolean).join(' – ')}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </WithPortalClientMessages>
  );
}

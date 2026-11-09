import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { requireExternalContext } from '@/modules/contractor-access';
import { getPortalWarranty } from '@/modules/contractor-closeout';
import { PortalWarrantyReportForm } from '@/modules/contractor-closeout/ui/portal-warranty-report-form';
import { resolveContractorProjectOrganization } from '@/modules/defects';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorWarrantyPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const context = await requireExternalContext();
  const covered = context.grants.some(
    (grant) =>
      grant.capabilities.has(EXTERNAL_CAPABILITIES.DEFECT_WORK) && (!grant.projectId || grant.projectId === projectId),
  );
  if (!covered) notFound();

  const organizationId = await loadOrNotFound(() => resolveContractorProjectOrganization(context, projectId));
  const { reports, agreements, vendorId } = await getPortalWarranty(context, { organizationId, projectId });
  if (!vendorId) notFound();

  const t = await getTranslations('handover');

  return (
    <WithPortalClientMessages extra={['handover', 'subcontracts']}>
      <div className="flex min-w-0 flex-col gap-4 pb-6">
        <PageHeader title={t('portalWarranty.title')} description={t('portalWarranty.description')} />

        <section className="rounded-md border border-[var(--pf-border)] p-3">
          <h2 className="text-sm font-medium">{t('portalWarranty.reportSection')}</h2>
          <div className="mt-3">
            <PortalWarrantyReportForm
              organizationId={organizationId}
              projectId={projectId}
              vendorId={vendorId}
              agreements={agreements}
            />
          </div>
        </section>

        {reports.length === 0 ? (
          <EmptyState title={t('portalWarranty.empty')} size="sm" />
        ) : (
          <ul className="flex flex-col gap-2">
            {reports.map((report) => (
              <li key={report.id} className="rounded-md border border-[var(--pf-border)] p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{report.title}</span>
                  <Badge tone="neutral">{t(`warranty.status.${report.status}`)}</Badge>
                </div>
                {report.notes ? <p className="mt-1 text-[var(--pf-text-secondary)]">{report.notes}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </WithPortalClientMessages>
  );
}

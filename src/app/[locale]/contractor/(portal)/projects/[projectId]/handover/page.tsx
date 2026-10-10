import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { getPortalHandover } from '@/modules/contractor-closeout';
import { PortalHandoverChecklist } from '@/modules/contractor-closeout/ui/portal-handover-checklist';
import { requireExternalContext } from '@/modules/contractor-access';
import { resolveContractorProjectOrganization } from '@/modules/defects';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorHandoverPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const context = await requireExternalContext();
  const organizationId = await loadOrNotFound(() => resolveContractorProjectOrganization(context, projectId));
  const t = await getTranslations('handover');
  const { closeouts } = await getPortalHandover(context, { organizationId, projectId });

  return (
    <WithPortalClientMessages extra={['handover', 'subcontracts']}>
      <div className="flex flex-col gap-4 pb-6">
        <PageHeader title={t('portal.title')} description={t('portal.description')} />
        {closeouts.map(({ closeout, items }) => (
          <section key={closeout.id} className="rounded-md border border-[var(--pf-border)] p-3 text-sm">
            <h2 className="font-medium">{t('portal.checklist')}</h2>
            <PortalHandoverChecklist
              organizationId={organizationId}
              projectId={projectId}
              agreementId={closeout.subcontractAgreementId}
              vendorId={closeout.vendorId}
              items={items.map((item) => ({ id: item.id, title: item.title, status: item.status }))}
            />
          </section>
        ))}
      </div>
    </WithPortalClientMessages>
  );
}

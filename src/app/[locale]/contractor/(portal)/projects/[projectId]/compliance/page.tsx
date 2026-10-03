import { ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { requireExternalContext } from '@/modules/contractor-access';
import { getContractorCompliance } from '@/modules/contractor-compliance';
import { ContractorComplianceSubmitForm } from '@/modules/contractor-compliance/ui/contractor-submit-form';
import { StatusBadge } from '@/components/ui/status-badge';
import { complianceStatusShape } from '@/modules/contractor-compliance/ui/status-shape';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorCompliancePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const context = await requireExternalContext();
  const grant = context.grants.find(
    (g) => g.capabilities.has(EXTERNAL_CAPABILITIES.COMPLIANCE_SUBMIT) && (!g.projectId || g.projectId === projectId),
  );
  if (!grant) notFound();

  const organizationId = grant.organizationId;
  const view = await getContractorCompliance(context, { organizationId, projectId });
  const t = await getTranslations('contractorCompliance');

  const actionRows = view.agreements.flatMap((agreement) =>
    agreement.requirements.filter(
      (row) =>
        !row.evaluation.pendingReview &&
        (row.evaluation.status !== 'current' || row.evaluation.lastRejected),
    ),
  );

  return (
    <WithClientMessages extra={['contractorCompliance']}>
      <div className="flex min-w-0 flex-col gap-4 pb-6">
        <PageHeader title={t('portal.title')} description={t('portal.description')} />

        {actionRows.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">{t('portal.actionRequired')}</h2>
            {actionRows.map((row) => (
              <ContractorComplianceSubmitForm
                key={row.id}
                organizationId={organizationId}
                projectId={projectId}
                requirementId={row.id}
                requirementTitle={row.title}
                requiresExpiry={row.requiresExpiry}
              />
            ))}
          </section>
        ) : null}

        {view.agreements.length === 0 ? (
          <EmptyState icon={ShieldCheck} title={t('portal.empty')} size="sm" />
        ) : (
          <ul className="flex flex-col gap-3">
            {view.agreements.flatMap((agreement) =>
              agreement.requirements.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-2 rounded-md border border-[var(--pf-border)] px-3 py-2 text-sm">
                  <span>{row.title}</span>
                  <StatusBadge
                    label={t(`status.${row.evaluation.status}`)}
                    shape={complianceStatusShape(row.evaluation.status)}
                  />
                </li>
              )),
            )}
          </ul>
        )}
      </div>
    </WithClientMessages>
  );
}

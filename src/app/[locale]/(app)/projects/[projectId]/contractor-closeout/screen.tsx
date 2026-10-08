import { ClipboardCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { listProjectAgreementCloseouts } from '@/modules/contractor-closeout';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { withOrgContext } from '@/shared/auth/session';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export async function ContractorCloseoutScreen({
  surfaceRoot: _surfaceRoot,
  params,
  agreementId,
}: {
  surfaceRoot?: string;
  params: Promise<{ projectId: string }>;
  agreementId?: string;
}) {
  const { projectId } = await params;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  const t = await getTranslations('handover');
  const rows = await withOrgContext((context) => listProjectAgreementCloseouts(context, projectId));
  const visible = agreementId ? rows.filter((row) => row.subcontractAgreementId === agreementId) : rows;

  return (
    <WithClientMessages extra={['handover']}>
      <div className="flex flex-col gap-6">
        <PageHeader title={t('closeout.title')} description={t('closeout.description')} />
        {visible.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title={t('closeout.empty.title')} description={t('closeout.empty.description')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border)] px-3 py-2 text-sm"
              >
                <span>{t('closeout.agreementLabel', { id: row.subcontractAgreementId.slice(0, 8) })}</span>
                <StatusBadge label={t(`closeout.status.${row.status}`)} shape="pending" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </WithClientMessages>
  );
}

export default async function ContractorCloseoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<{ agreementId?: string }>;
}) {
  const agreementId = searchParams ? (await searchParams).agreementId : undefined;
  return <ContractorCloseoutScreen params={params} agreementId={agreementId} />;
}

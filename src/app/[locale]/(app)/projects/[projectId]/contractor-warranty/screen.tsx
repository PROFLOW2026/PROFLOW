import { Shield } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { listProjectWarrantyReports } from '@/modules/contractor-closeout';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { withOrgContext } from '@/shared/auth/session';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export async function ContractorWarrantyScreen({
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
  const reports = await withOrgContext((context) => listProjectWarrantyReports(context, projectId));
  const visible = agreementId
    ? reports.filter((report) => report.subcontractAgreementId === agreementId)
    : reports;

  return (
    <WithAppClientMessages extra={['handover']}>
      <div className="flex flex-col gap-6">
        <PageHeader title={t('warranty.title')} description={t('warranty.description')} />
        {visible.length === 0 ? (
          <EmptyState icon={Shield} title={t('warranty.empty.title')} description={t('warranty.empty.description')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((report) => (
              <li
                key={report.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border)] px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{report.title}</p>
                  {(report.retentionFlag || report.guaranteeFlag) && (
                    <p className="text-[var(--pf-text-muted)]">{t('warranty.flagsHint')}</p>
                  )}
                </div>
                <StatusBadge label={t(`warranty.status.${report.status}`)} shape="pending" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </WithAppClientMessages>
  );
}

export default async function ContractorWarrantyPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<{ agreementId?: string }>;
}) {
  const agreementId = searchParams ? (await searchParams).agreementId : undefined;
  return <ContractorWarrantyScreen params={params} agreementId={agreementId} />;
}

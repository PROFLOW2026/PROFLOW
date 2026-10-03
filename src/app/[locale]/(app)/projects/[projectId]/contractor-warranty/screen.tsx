import { Shield } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { listProjectWarrantyReports } from '@/modules/contractor-closeout';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { withOrgContext } from '@/shared/auth/session';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export async function ContractorWarrantyScreen({ surfaceRoot: _surfaceRoot, params }: {
    surfaceRoot?: string;
 params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  const t = await getTranslations('handover');
  const reports = await withOrgContext((context) => listProjectWarrantyReports(context, projectId));

  return (
    <WithClientMessages extra={['handover']}>
      <div className="flex flex-col gap-6">
        <PageHeader title={t('warranty.title')} description={t('warranty.description')} />
        {reports.length === 0 ? (
          <EmptyState icon={Shield} title={t('warranty.empty.title')} description={t('warranty.empty.description')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {reports.map((report) => (
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
    </WithClientMessages>
  );
}

export default function ContractorWarrantyPage(
  props: Omit<Parameters<typeof ContractorWarrantyScreen>[0], 'surfaceRoot'>,
) {
  return <ContractorWarrantyScreen {...props} />;
}

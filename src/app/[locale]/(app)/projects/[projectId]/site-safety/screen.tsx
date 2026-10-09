import { HardHat } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { listProjectAgreements } from '@/modules/contractor-compliance';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { listContractorSafety } from '@/modules/safety/contractor';
import { SafetyReportForm } from '@/modules/safety/contractor/ui/safety-report-form';
import { withOrgContext } from '@/shared/auth/session';
import { AuthorizationError } from '@/shared/errors';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export async function ProjectSiteSafetyScreen({ surfaceRoot: _surfaceRoot, params }: {
    surfaceRoot?: string;
 params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.SAFETY_MANAGE);
  const t = await getTranslations('contractorCompliance');

  const data = await withOrgContext(async (context) => {
    try {
      const [safety, agreements] = await Promise.all([
        listContractorSafety(context, { projectId, limit: 100 }),
        listProjectAgreements(context.db, context.organizationId, projectId),
      ]);
      return { safety, agreements };
    } catch (error) {
      if (error instanceof AuthorizationError) return null;
      throw error;
    }
  });
  if (!data) notFound();

  const defaultVendor = data.agreements[0]?.vendorId;

  return (
    <WithAppClientMessages extra={['contractorCompliance']}>
      <div className="flex flex-col gap-6">
        <PageHeader title={t('safety.title')} description={t('safety.description')} />

        {defaultVendor ? (
          <SafetyReportForm mode="internal" projectId={projectId} vendorId={defaultVendor} />
        ) : null}

        {data.safety.records.length === 0 ? (
          <EmptyState icon={HardHat} title={t('safety.empty')} size="sm" />
        ) : (
          <ul className="flex flex-col gap-2">
            {data.safety.records.map((record) => (
              <li key={record.id} className="rounded-md border border-[var(--pf-border)] p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{record.title}</span>
                  <Badge tone="neutral">{t(`safety.types.${record.recordType}`)}</Badge>
                  <Badge tone={record.status === 'closed' ? 'success' : 'warning'}>{record.status}</Badge>
                </div>
                <p className="mt-1 text-[var(--pf-text-secondary)]">{record.description}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </WithAppClientMessages>
  );
}

export default function ProjectSiteSafetyPage(
  props: Omit<Parameters<typeof ProjectSiteSafetyScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectSiteSafetyScreen {...props} />;
}

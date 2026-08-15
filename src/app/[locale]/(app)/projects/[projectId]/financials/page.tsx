import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { ProjectFinancialsPanel } from '@/modules/financials/ui';
import { Link } from '@/shared/i18n/navigation';
import { loadProjectDetail } from '../load-project-detail';
import { loadProjectFinancials } from '../load-project-financials';
import { ProjectFinancialsExportLink } from './project-financials-export-link';
import { ReportDownloadButtons } from '@/modules/reports/ui';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

interface ProjectFinancialsPageProps {
  params: Promise<{ projectId: string; locale: string }>;
}

export async function generateMetadata({ params }: ProjectFinancialsPageProps): Promise<Metadata> {
  const { locale, projectId } = await params;
  const t = await getTranslations({ locale, namespace: 'financial' });

  const detail = await loadProjectDetail(projectId, false);

  return {
    title: `${t('currentContractValue')} — ${detail.project.name}`,
  };
}

export default async function ProjectFinancialsPage({ params }: ProjectFinancialsPageProps) {
  const { projectId } = await params;
  const tCommon = await getTranslations('common');

  const [detail] = await Promise.all([
    loadProjectDetail(projectId, false),
    // Warm request-scoped financials so the panel does not start compose cold.
    loadProjectFinancials(projectId).catch(() => null),
  ]);

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader
        title={detail.project.name}
        description={
          <Link href={`/projects/${projectId}`} className={cn(textNavLinkClassName, 'text-sm')}>
            {tCommon('actions.back')}
          </Link>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ProjectFinancialsExportLink projectId={projectId} />
            <WithClientMessages extra={['reports', 'exports']}>
              <ReportDownloadButtons kind="project_financial_summary" id={projectId} compact />
            </WithClientMessages>
          </div>
        }
      />
      <ProjectFinancialsPanel projectId={projectId} />
    </div>
  );
}

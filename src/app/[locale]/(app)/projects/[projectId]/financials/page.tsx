import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { ProjectFinancialsPanel } from '@/modules/financials/ui';
import { getProjectDetail } from '@/modules/projects';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';

interface ProjectFinancialsPageProps {
  params: Promise<{ projectId: string; locale: string }>;
}

export async function generateMetadata({ params }: ProjectFinancialsPageProps): Promise<Metadata> {
  const { locale, projectId } = await params;
  const t = await getTranslations({ locale, namespace: 'financial' });

  const detail = await withOrgContext((context) => getProjectDetail(context, projectId));

  return {
    title: `${t('currentContractValue')} — ${detail.project.name}`,
  };
}

export default async function ProjectFinancialsPage({ params }: ProjectFinancialsPageProps) {
  const { projectId } = await params;
  const tCommon = await getTranslations('common');
  const tFinancial = await getTranslations('financial');

  const detail = await withOrgContext((context) => getProjectDetail(context, projectId));

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader
        title={detail.project.name}
        description={
          <Link href={`/projects/${projectId}`} className="text-sm hover:underline">
            {tCommon('actions.back')}
          </Link>
        }
        actions={
          <Link
            className="text-sm underline underline-offset-2"
            href={`/exports/project-financials?projectId=${encodeURIComponent(projectId)}`}
          >
            {tFinancial('exportCsv')}
          </Link>
        }
      />
      <ProjectFinancialsPanel projectId={projectId} />
    </div>
  );
}

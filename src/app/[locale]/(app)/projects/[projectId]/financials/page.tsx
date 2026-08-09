import type { Metadata } from 'next';
import { cache } from 'react';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { ProjectFinancialsPanel } from '@/modules/financials/ui';
import { getProjectDetail } from '@/modules/projects';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { ProjectFinancialsExportLink } from './project-financials-export-link';

interface ProjectFinancialsPageProps {
  params: Promise<{ projectId: string; locale: string }>;
}

/** Dedupes metadata + page detail fetch within one request. */
const loadProjectDetail = cache(async (projectId: string) =>
  withOrgContext((context) => getProjectDetail(context, projectId)),
);

export async function generateMetadata({ params }: ProjectFinancialsPageProps): Promise<Metadata> {
  const { locale, projectId } = await params;
  const t = await getTranslations({ locale, namespace: 'financial' });

  const detail = await loadProjectDetail(projectId);

  return {
    title: `${t('currentContractValue')} — ${detail.project.name}`,
  };
}

export default async function ProjectFinancialsPage({ params }: ProjectFinancialsPageProps) {
  const { projectId } = await params;
  const tCommon = await getTranslations('common');

  const detail = await loadProjectDetail(projectId);

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader
        title={detail.project.name}
        description={
          <Link href={`/projects/${projectId}`} className="text-sm hover:underline">
            {tCommon('actions.back')}
          </Link>
        }
        actions={<ProjectFinancialsExportLink projectId={projectId} />}
      />
      <ProjectFinancialsPanel projectId={projectId} />
    </div>
  );
}

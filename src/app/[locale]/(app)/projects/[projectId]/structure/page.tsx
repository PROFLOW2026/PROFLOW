import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { ProjectStructureScreen } from '@/modules/project-profile/ui/project-structure-screen';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'projectProfile' });
  return { title: t('page.title') };
}

export default async function ProjectStructurePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  const t = await getTranslations('projectProfile');
  const basePath = `/projects/${projectId}/structure`;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader title={t('page.title')} description={t('page.description')} />
      <ProjectStructureScreen projectId={projectId} basePath={basePath} />
    </div>
  );
}

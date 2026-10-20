import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { PROJECT_CAPABILITIES, loadProjectTeamPage } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { ProjectTeamScreen } from '@/modules/project-team/ui/project-team-screen';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export async function generateMetadata() {
  const t = await getTranslations('projectTeam');
  return { title: t('page.title') };
}

export default async function ProjectTeamPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  const [t, tWorkforce, data, canManageRoster] = await Promise.all([
    getTranslations('projectTeam'),
    getTranslations('workforce'),
    withOrgContext((context) => loadProjectTeamPage(context, projectId)),
    withOrgContext(async (context) => hasPermission(context, PERMISSIONS.WORKFORCE_MANAGE)),
  ]);

  return (
    <MainAppPage className="w-full min-w-0">
      <PageHeader title={t('page.title')} description={t('page.description')} />
      <MainAppSection className="w-full min-w-0">
        <div className="flex w-full min-w-0 flex-col gap-4">
          <p className="text-sm text-[var(--pf-text-muted)]">{t('page.consultantRosterHint')}</p>
          {canManageRoster ? (
            <Link
              href={`/projects/${projectId}?tab=team`}
              className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--pf-text-brand)] hover:underline"
            >
              {tWorkforce('projectPanel.addToRoster')}
            </Link>
          ) : null}
          <ProjectTeamScreen data={data} />
        </div>
      </MainAppSection>
    </MainAppPage>
  );
}

import { getTranslations } from 'next-intl/server';
import { PROJECT_CAPABILITIES, loadProjectTeamPage } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { MyProjectAccessCard } from '@/modules/project-team/ui/my-project-access';
import { ProjectTeamScreen } from '@/modules/project-team/ui/project-team-screen';
import { employeePageStackClass } from '@/modules/employee-app/ui/employee-surface-styles';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';

interface PageProps {
  params: Promise<{ projectId: string }>;
}

/**
 * Employee App entry for project-team members. Employee sessions never reach the
 * Owner app (`assertOwnerAppSurface`), so the team surface is mounted here too and
 * is authorized purely by project capabilities.
 */
export default async function EmployeeProjectTeamPage({ params }: PageProps) {
  const { projectId } = await params;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  const [t, data] = await Promise.all([
    getTranslations('projectTeam'),
    withOrgContext((context) => loadProjectTeamPage(context, projectId)),
  ]);
  const me = data.members.find((member) => member.userId === data.viewer.userId && member.status === 'active');

  return (
    <div className={employeePageStackClass}>
      <header className="flex flex-col gap-1">
        <Link
          href="/employee/projects"
          className="text-sm text-[var(--pf-text-brand)] underline-offset-4 hover:underline"
        >
          {t('employee.backToProjects')}
        </Link>
        <h2 className="text-xl font-bold text-[var(--pf-text-primary)]">{data.project.name}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('page.description')}</p>
      </header>

      {me ? (
        <MyProjectAccessCard
          capabilities={data.viewer.capabilities}
          title={me.title}
          templateKey={me.templateKey}
        />
      ) : null}

      <ProjectTeamScreen data={data} />
    </div>
  );
}

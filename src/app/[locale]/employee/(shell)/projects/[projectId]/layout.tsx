import { getLocale } from 'next-intl/server';
import { ProjectExecutionNav } from '@/app/[locale]/(app)/projects/[projectId]/project-execution-nav';
import { employeeProjectRoot, loadProjectExecutionNav } from '@/modules/project-workspace';
import { localeDirection } from '@/shared/i18n/config';
import { withOrgContext } from '@/shared/auth/session';

export default async function EmployeeProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const locale = await getLocale();
  const executionNav = await withOrgContext((context) =>
    loadProjectExecutionNav(context, projectId, { surfaceRoot: employeeProjectRoot(projectId) }),
  ).catch(() => ({ showGroup: false, links: [] }));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {executionNav.showGroup ? (
        <ProjectExecutionNav links={executionNav.links} dir={localeDirection(locale)} />
      ) : null}
      {children}
    </div>
  );
}

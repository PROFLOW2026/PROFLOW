import { getLocale } from 'next-intl/server';
import { loadProjectExecutionNav } from '@/modules/project-workspace/application/load-execution-nav';
import { employeeProjectRoot } from '@/modules/project-workspace/domain/project-surface-path';
import { ProjectExecutionNav } from '@/modules/project-workspace/ui/project-execution-nav';
import { localeDirection, PROJECT_SURFACE_CLIENT_MESSAGE_NAMESPACES } from '@/shared/i18n/config';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';
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
    <WithClientMessages extra={PROJECT_SURFACE_CLIENT_MESSAGE_NAMESPACES}>
    <div className="flex min-w-0 flex-col gap-4">
      {executionNav.showGroup ? (
        <ProjectExecutionNav links={executionNav.links} dir={localeDirection(locale)} />
      ) : null}
      {children}
    </div>
    </WithClientMessages>
  );
}

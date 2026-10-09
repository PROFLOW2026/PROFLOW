import { getLocale } from 'next-intl/server';
import { loadProjectExecutionNav } from '@/modules/project-workspace/application/load-execution-nav';
import { employeeProjectRoot } from '@/modules/project-workspace/domain/project-surface-path';
import { DeveloperGcExecutionEntry } from '@/modules/project-workspace/ui/developer-gc-execution-entry';
import { ProjectExecutionNav } from '@/modules/project-workspace/ui/project-execution-nav';
import { ProjectLayoutMode } from '@/modules/project-workspace/ui/project-layout-mode';
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

  const dir = localeDirection(locale);
  const executionEntryHref =
    executionNav.links.find((link) => link.key === 'overview')?.href ?? executionNav.links[0]?.href ?? null;

  return (
    <WithClientMessages extra={PROJECT_SURFACE_CLIENT_MESSAGE_NAMESPACES}>
    <div className="flex min-w-0 flex-col gap-4">
      <ProjectLayoutMode
        projectId={projectId}
        surface="employee"
        commercial={
          <>
            {executionNav.showGroup && executionEntryHref ? (
              <DeveloperGcExecutionEntry href={executionEntryHref} />
            ) : null}
            {children}
          </>
        }
        execution={
          <>
            {executionNav.showGroup ? (
              <ProjectExecutionNav
                links={executionNav.links}
                dir={dir}
                backToProjectHref={`/employee/projects/${projectId}`}
              />
            ) : null}
            {children}
          </>
        }
      />
    </div>
    </WithClientMessages>
  );
}

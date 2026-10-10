import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { loadProjectLayoutIdentity } from '../../../../(app)/projects/[projectId]/load-project-detail';
import { loadProjectExecutionNav } from '@/modules/project-workspace/application/load-execution-nav';
import { isEmployeeExecutionWorkspacePath } from '@/modules/project-workspace/domain/execution-workspace-path';
import { isEmployeeProjectWorkWorkspacePath } from '@/modules/project-workspace/domain/project-work-workspace-path';
import { employeeProjectRoot } from '@/modules/project-workspace/domain/project-surface-path';
import { DeveloperGcExecutionEntry } from '@/modules/project-workspace/ui/developer-gc-execution-entry';
import { ProjectExecutionNav } from '@/modules/project-workspace/ui/project-execution-nav';
import { ProjectOperationalContextHeader } from '@/modules/project-workspace/ui/project-operational-context-header';
import { ProjectWorkNav } from '@/modules/project-workspace/ui/project-work-nav';
import { getRequestPathname } from '@/shared/http/request-pathname';
import { localeDirection, PROJECT_SURFACE_CLIENT_MESSAGE_NAMESPACES } from '@/shared/i18n/config';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';
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

  const requestPathname = await getRequestPathname();
  const inProjectWorkWorkspace = isEmployeeProjectWorkWorkspacePath(requestPathname, projectId);
  const inExecutionWorkspace =
    !inProjectWorkWorkspace && isEmployeeExecutionWorkspacePath(requestPathname, projectId);
  const employeeRoot = employeeProjectRoot(projectId);

  if (inProjectWorkWorkspace) {
    const identity = await loadProjectLayoutIdentity(projectId);
    if (!identity) notFound();
    return (
      <WithAppClientMessages extra={PROJECT_SURFACE_CLIENT_MESSAGE_NAMESPACES}>
        <div className="flex min-w-0 flex-col gap-4">
          <ProjectOperationalContextHeader
            projectName={identity.name}
            documentNumber={identity.documentNumber}
            backToProjectHref={employeeRoot}
            workspaceKind="work"
          />
          <ProjectWorkNav projectId={projectId} dir={dir} compact surfaceRoot={employeeRoot} />
          {children}
        </div>
      </WithAppClientMessages>
    );
  }

  return (
    <WithAppClientMessages extra={PROJECT_SURFACE_CLIENT_MESSAGE_NAMESPACES}>
    <div className="flex min-w-0 flex-col gap-4">
      {inExecutionWorkspace ? (
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
      ) : (
        <>
          {executionNav.showGroup && executionEntryHref ? (
            <DeveloperGcExecutionEntry href={executionEntryHref} />
          ) : null}
          {children}
        </>
      )}
    </div>
    </WithAppClientMessages>
  );
}

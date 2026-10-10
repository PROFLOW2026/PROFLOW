import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { loadProjectLayoutIdentity } from '../../../../(app)/projects/[projectId]/load-project-detail';
import { loadProjectExecutionNav } from '@/modules/project-workspace/application/load-execution-nav';
import { employeeProjectRoot } from '@/modules/project-workspace/domain/project-surface-path';
import { DeveloperGcExecutionEntry } from '@/modules/project-workspace/ui/developer-gc-execution-entry';
import { ProjectExecutionNav } from '@/modules/project-workspace/ui/project-execution-nav';
import { ProjectOperationalContextHeader } from '@/modules/project-workspace/ui/project-operational-context-header';
import { ProjectWorkNav } from '@/modules/project-workspace/ui/project-work-nav';
import { localeDirection, PROJECT_SURFACE_CLIENT_MESSAGE_NAMESPACES } from '@/shared/i18n/config';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';
import { withOrgContext } from '@/shared/auth/session';
import { EmployeeProjectWorkspaceShell } from './employee-project-workspace-shell';

export default async function EmployeeProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const locale = await getLocale();
  const employeeRoot = employeeProjectRoot(projectId);

  const [identity, executionNav] = await Promise.all([
    loadProjectLayoutIdentity(projectId),
    withOrgContext((context) =>
      loadProjectExecutionNav(context, projectId, { surfaceRoot: employeeRoot }),
    ).catch(() => ({ showGroup: false, links: [] })),
  ]);

  if (!identity) notFound();

  const dir = localeDirection(locale);
  const executionEntryHref =
    executionNav.links.find((link) => link.key === 'overview')?.href ?? executionNav.links[0]?.href ?? null;

  const commercialTop =
    executionNav.showGroup && executionEntryHref ? (
      <DeveloperGcExecutionEntry href={executionEntryHref} />
    ) : null;

  const workChrome = (
    <>
      <ProjectOperationalContextHeader
        projectName={identity.name}
        documentNumber={identity.documentNumber ?? ''}
        backToProjectHref={employeeRoot}
        workspaceKind="work"
      />
      <ProjectWorkNav projectId={projectId} dir={dir} compact surfaceRoot={employeeRoot} />
    </>
  );

  const executionChrome =
    executionNav.showGroup ? (
      <ProjectExecutionNav links={executionNav.links} dir={dir} backToProjectHref={employeeRoot} />
    ) : null;

  return (
    <WithAppClientMessages extra={PROJECT_SURFACE_CLIENT_MESSAGE_NAMESPACES}>
      <EmployeeProjectWorkspaceShell
        projectId={projectId}
        commercialTop={commercialTop}
        workChrome={workChrome}
        executionChrome={executionChrome}
      >
        {children}
      </EmployeeProjectWorkspaceShell>
    </WithAppClientMessages>
  );
}

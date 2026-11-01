import { notFound } from 'next/navigation';
import { getEmployeeProjectTaskOverview } from '@/modules/employee-app/application/employee-pm-tasks';
import { employeePageStackClass } from '@/modules/employee-app/ui/employee-surface-styles';
import { InfraWorkspaceEmployee } from '@/modules/infra-mapping/ui/infra-workspace-main';
import { withOrgContext } from '@/shared/auth/session';

interface PageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ taskId?: string | string[] }>;
}

/**
 * Employee app: document and locate infrastructure on an ASSIGNED project. Authorization (project
 * membership / capabilities) is enforced again by every infra use-case; files go to the owning
 * organization's cloud, never to a personal connection.
 */
export default async function EmployeeProjectInfrastructurePage({ params, searchParams }: PageProps) {
  const [{ projectId }, search] = await Promise.all([params, searchParams]);
  const taskId = Array.isArray(search.taskId) ? search.taskId[0] : search.taskId;

  const overview = await withOrgContext((context) => getEmployeeProjectTaskOverview(context, projectId));
  if (!overview) notFound();

  return (
    <div className={employeePageStackClass}>
      <p className="text-sm font-medium text-[var(--pf-text-secondary)]">{overview.displayName}</p>
      <InfraWorkspaceEmployee projectId={projectId} taskId={taskId ?? null} />
    </div>
  );
}

import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { ProjectExecutionDashboardScreen } from '@/app/[locale]/(app)/projects/[projectId]/execution/screen';

export default async function EmployeeProjectExecutionDashboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  return (
    <ProjectExecutionDashboardScreen
      params={Promise.resolve(resolved)}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

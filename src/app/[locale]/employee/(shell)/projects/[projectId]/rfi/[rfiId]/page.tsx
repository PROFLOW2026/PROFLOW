import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { ProjectRfiDetailScreen } from '@/app/[locale]/(app)/projects/[projectId]/rfi/[rfiId]/screen';

export default async function EmployeeProjectRfiDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; rfiId: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  return (
    <ProjectRfiDetailScreen
      params={Promise.resolve(resolved)}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

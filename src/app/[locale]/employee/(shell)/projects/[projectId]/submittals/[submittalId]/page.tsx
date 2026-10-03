import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { ProjectSubmittalDetailScreen } from '@/app/[locale]/(app)/projects/[projectId]/submittals/[submittalId]/screen';

export default async function EmployeeProjectSubmittalDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; submittalId: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  return (
    <ProjectSubmittalDetailScreen
      params={Promise.resolve(resolved)}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

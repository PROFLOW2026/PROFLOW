import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { ProjectInspectionDetailScreen } from '@/app/[locale]/(app)/projects/[projectId]/inspections/[inspectionId]/screen';

export default async function EmployeeProjectInspectionDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; inspectionId: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  return (
    <ProjectInspectionDetailScreen
      params={Promise.resolve(resolved)}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

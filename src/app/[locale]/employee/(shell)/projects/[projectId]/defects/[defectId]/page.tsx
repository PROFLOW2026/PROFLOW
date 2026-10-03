import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { ProjectDefectDetailScreen } from '@/app/[locale]/(app)/projects/[projectId]/defects/[defectId]/screen';

export default async function EmployeeProjectDefectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; defectId: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  return (
    <ProjectDefectDetailScreen
      params={Promise.resolve(resolved)}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

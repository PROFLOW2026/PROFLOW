import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { ProjectDrawingDetailScreen } from '@/app/[locale]/(app)/projects/[projectId]/plans/[drawingId]/screen';

export default async function EmployeeProjectDrawingDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; drawingId: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.DOCUMENTS_VIEW);
  return (
    <ProjectDrawingDetailScreen
      params={Promise.resolve(resolved)}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

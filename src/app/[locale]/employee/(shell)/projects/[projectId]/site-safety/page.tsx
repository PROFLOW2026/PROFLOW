import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { ProjectSiteSafetyScreen } from '@/app/[locale]/(app)/projects/[projectId]/site-safety/screen';

export default async function EmployeeProjectSiteSafetyPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.SAFETY_MANAGE);
  return (
    <ProjectSiteSafetyScreen
      params={Promise.resolve(resolved)}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

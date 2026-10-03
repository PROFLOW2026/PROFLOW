import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { ProjectPlansScreen } from '@/app/[locale]/(app)/projects/[projectId]/plans/screen';

export default async function EmployeeProjectPlansPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.DOCUMENTS_VIEW);
  return (
    <ProjectPlansScreen
      params={Promise.resolve(resolved)}
      searchParams={searchParams}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

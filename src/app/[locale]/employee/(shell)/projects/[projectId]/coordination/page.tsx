import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { ProjectCoordinationScreen } from '@/app/[locale]/(app)/projects/[projectId]/coordination/screen';

export default async function EmployeeProjectCoordinationPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ scope?: string; new?: string; page?: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(
    projectId,
    [PROJECT_CAPABILITIES.SCHEDULE_VIEW, PROJECT_CAPABILITIES.CONTRACTOR_COORDINATE],
    { mode: 'any' },
  );
  return (
    <ProjectCoordinationScreen
      params={Promise.resolve(resolved)}
      searchParams={searchParams}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

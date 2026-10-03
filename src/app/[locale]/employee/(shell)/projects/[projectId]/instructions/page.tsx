import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { InstructionsScreen } from '@/app/[locale]/(app)/projects/[projectId]/instructions/screen';

export default async function EmployeeInstructionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ status?: string; page?: string; create?: string; logDate?: string; meetingId?: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.CONTRACTOR_VIEW);
  return (
    <InstructionsScreen
      params={Promise.resolve(resolved)}
      searchParams={searchParams}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { InstructionDetailScreen } from '@/app/[locale]/(app)/projects/[projectId]/instructions/[instructionId]/screen';

export default async function EmployeeInstructionDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; instructionId: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.CONTRACTOR_VIEW);
  return (
    <InstructionDetailScreen
      params={Promise.resolve(resolved)}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

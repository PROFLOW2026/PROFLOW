import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { ProjectDeductionsScreen } from '@/app/[locale]/(app)/projects/[projectId]/deductions/screen';

export default async function EmployeeProjectDeductionsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(projectId, 'claim.view');
  return (
    <ProjectDeductionsScreen
      params={Promise.resolve(resolved)}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

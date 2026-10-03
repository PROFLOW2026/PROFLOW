import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { ProjectCostControlScreen } from '@/app/[locale]/(app)/projects/[projectId]/cost-control/screen';

export default async function EmployeeProjectCostControlPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(
    projectId,
    [PROJECT_CAPABILITIES.FINANCIAL_VIEW, PROJECT_CAPABILITIES.PROJECT_BUDGET_VIEW],
    { mode: 'any' },
  );
  return (
    <ProjectCostControlScreen
      params={Promise.resolve(resolved)}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

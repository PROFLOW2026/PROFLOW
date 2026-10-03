import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { ContractorCloseoutScreen } from '@/app/[locale]/(app)/projects/[projectId]/contractor-closeout/screen';

export default async function EmployeeContractorCloseoutPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  return (
    <ContractorCloseoutScreen
      params={Promise.resolve(resolved)}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { ContractorCloseoutScreen } from '@/app/[locale]/(app)/projects/[projectId]/contractor-closeout/screen';

export default async function EmployeeContractorCloseoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<{ agreementId?: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  const agreementId = searchParams ? (await searchParams).agreementId : undefined;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  return (
    <ContractorCloseoutScreen
      params={Promise.resolve(resolved)}
      surfaceRoot={`/employee/projects/${projectId}`}
      agreementId={agreementId}
    />
  );
}

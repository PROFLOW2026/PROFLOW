import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { ContractorWarrantyScreen } from '@/app/[locale]/(app)/projects/[projectId]/contractor-warranty/screen';

export default async function EmployeeContractorWarrantyPage({
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
    <ContractorWarrantyScreen
      params={Promise.resolve(resolved)}
      surfaceRoot={`/employee/projects/${projectId}`}
      agreementId={agreementId}
    />
  );
}

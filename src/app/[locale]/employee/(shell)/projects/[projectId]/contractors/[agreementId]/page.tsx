import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { Contractor360Screen } from '@/app/[locale]/(app)/projects/[projectId]/contractors/[agreementId]/screen';

export default async function EmployeeContractor360Page({
  params,
}: {
  params: Promise<{ projectId: string; agreementId: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.CONTRACTOR_VIEW);
  return (
    <Contractor360Screen
      params={Promise.resolve(resolved)}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

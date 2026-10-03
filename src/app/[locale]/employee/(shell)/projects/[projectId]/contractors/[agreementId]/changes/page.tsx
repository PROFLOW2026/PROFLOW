import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { AgreementChangesScreen } from '@/app/[locale]/(app)/projects/[projectId]/contractors/[agreementId]/changes/screen';

export default async function EmployeeAgreementChangesPage({
  params,
}: {
  params: Promise<{ projectId: string; agreementId: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.CONTRACTOR_VIEW);
  return (
    <AgreementChangesScreen
      params={Promise.resolve(resolved)}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

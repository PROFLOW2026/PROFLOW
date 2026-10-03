import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { AgreementLinesScreen } from '@/app/[locale]/(app)/projects/[projectId]/contractors/[agreementId]/lines/screen';

export default async function EmployeeAgreementLinesPage({
  params,
}: {
  params: Promise<{ projectId: string; agreementId: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.CONTRACTOR_VIEW);
  return (
    <AgreementLinesScreen
      params={Promise.resolve(resolved)}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { TenderPackageScreen } from '@/app/[locale]/(app)/projects/[projectId]/tenders/[packageId]/screen';

export default async function EmployeeTenderPackagePage({
  params,
}: {
  params: Promise<{ projectId: string; packageId: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  return (
    <TenderPackageScreen
      params={Promise.resolve(resolved)}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

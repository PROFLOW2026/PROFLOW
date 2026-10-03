import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { ProjectClaimDetailScreen } from '@/app/[locale]/(app)/projects/[projectId]/claims/[claimId]/screen';

export default async function EmployeeProjectClaimDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; claimId: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(projectId, 'claim.view');
  return (
    <ProjectClaimDetailScreen
      params={Promise.resolve(resolved)}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

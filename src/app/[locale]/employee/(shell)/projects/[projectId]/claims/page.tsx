import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { ProjectClaimsScreen } from '@/app/[locale]/(app)/projects/[projectId]/claims/screen';

export default async function EmployeeProjectClaimsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(projectId, 'claim.view');
  return (
    <ProjectClaimsScreen
      params={Promise.resolve(resolved)}
      searchParams={searchParams}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

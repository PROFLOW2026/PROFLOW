import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { SiteMeetingsScreen } from '@/app/[locale]/(app)/projects/[projectId]/site-meetings/screen';

export default async function EmployeeSiteMeetingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ page?: string; create?: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  return (
    <SiteMeetingsScreen
      params={Promise.resolve(resolved)}
      searchParams={searchParams}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

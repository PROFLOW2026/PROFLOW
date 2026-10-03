import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { ProjectContractorsScreen } from '@/app/[locale]/(app)/projects/[projectId]/contractors/screen';

export default async function EmployeeProjectContractorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.CONTRACTOR_VIEW);
  return (
    <ProjectContractorsScreen
      params={Promise.resolve(resolved)}
      searchParams={searchParams}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

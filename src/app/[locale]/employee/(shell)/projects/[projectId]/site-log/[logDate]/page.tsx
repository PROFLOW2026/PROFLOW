import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { SiteLogDayScreen } from '@/app/[locale]/(app)/projects/[projectId]/site-log/[logDate]/screen';

export default async function EmployeeSiteLogDayPage({
  params,
}: {
  params: Promise<{ projectId: string; logDate: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  return (
    <SiteLogDayScreen
      params={Promise.resolve(resolved)}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

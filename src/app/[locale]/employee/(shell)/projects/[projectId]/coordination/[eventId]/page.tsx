import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { CoordinationEventScreen } from '@/app/[locale]/(app)/projects/[projectId]/coordination/[eventId]/screen';

export default async function EmployeeCoordinationEventPage({
  params,
}: {
  params: Promise<{ projectId: string; eventId: string }>;
}) {
  const resolved = await params;
  const projectId = resolved.projectId;
  await requireProjectCapabilityPage(
    projectId,
    [PROJECT_CAPABILITIES.SCHEDULE_VIEW, PROJECT_CAPABILITIES.CONTRACTOR_COORDINATE],
    { mode: 'any' },
  );
  return (
    <CoordinationEventScreen
      params={Promise.resolve(resolved)}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

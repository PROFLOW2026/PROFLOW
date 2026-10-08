import { ExecutionHubLinks } from '@/modules/project-workspace/ui/execution-hub-links';

export default async function EmployeeExecutionQualityPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <ExecutionHubLinks
      hub="quality"
      params={Promise.resolve({ projectId })}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

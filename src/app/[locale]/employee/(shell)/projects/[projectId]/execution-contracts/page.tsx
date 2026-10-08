import { ExecutionHubScreen } from '@/app/[locale]/(app)/projects/[projectId]/execution-hub-screen';

export default async function EmployeeExecutionContractsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <ExecutionHubScreen
      hub="contracts"
      params={Promise.resolve({ projectId })}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

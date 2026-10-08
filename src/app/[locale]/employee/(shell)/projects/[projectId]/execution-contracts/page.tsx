import { ContractsExecutionHub } from '@/modules/project-workspace/ui/contracts-execution-hub';

export default async function EmployeeExecutionContractsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <ContractsExecutionHub
      params={Promise.resolve({ projectId })}
      surfaceRoot={`/employee/projects/${projectId}`}
    />
  );
}

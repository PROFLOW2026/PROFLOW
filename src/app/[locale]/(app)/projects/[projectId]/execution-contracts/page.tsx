import { ContractsExecutionHub } from '@/modules/project-workspace/ui/contracts-execution-hub';

export default function ExecutionContractsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return <ContractsExecutionHub params={params} />;
}

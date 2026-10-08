import { ExecutionHubScreen } from '@/modules/project-workspace/ui/execution-hub-screen';

export default function ContractorPaymentsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return <ExecutionHubScreen hub="payments" params={params} />;
}

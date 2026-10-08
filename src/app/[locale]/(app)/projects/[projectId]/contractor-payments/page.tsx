import { ExecutionHubLinks } from '@/modules/project-workspace/ui/execution-hub-links';

export default function ContractorPaymentsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return <ExecutionHubLinks hub="payments" params={params} />;
}

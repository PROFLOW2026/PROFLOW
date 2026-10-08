import { ExecutionHubScreen } from '../execution-hub-screen';

export default function ContractorPaymentsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return <ExecutionHubScreen hub="payments" params={params} />;
}

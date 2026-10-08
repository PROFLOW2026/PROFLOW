import { ExecutionHubScreen } from '../execution-hub-screen';

export default function ExecutionContractsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return <ExecutionHubScreen hub="contracts" params={params} />;
}

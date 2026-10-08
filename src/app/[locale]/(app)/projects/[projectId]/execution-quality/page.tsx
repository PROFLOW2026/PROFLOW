import { ExecutionHubScreen } from '../execution-hub-screen';

export default function ExecutionQualityPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return <ExecutionHubScreen hub="quality" params={params} />;
}

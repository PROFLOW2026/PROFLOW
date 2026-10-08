import { ExecutionHubLinks } from '@/modules/project-workspace/ui/execution-hub-links';

export default function ExecutionQualityPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return <ExecutionHubLinks hub="quality" params={params} />;
}

import { ExecutionHubLinks } from '@/modules/project-workspace/ui/execution-hub-links';

export default function ExecutionPlanningPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return <ExecutionHubLinks hub="planning" params={params} />;
}

import { ExecutionHubScreen } from '@/modules/project-workspace/ui/execution-hub-screen';

export default function ExecutionPlanningPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return <ExecutionHubScreen hub="planning" params={params} />;
}

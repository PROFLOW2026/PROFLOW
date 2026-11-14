import { TakeoffOwnerClient } from '../takeoff-owner-client';

interface PageProps {
  params: Promise<{ projectId: string; analysisId: string }>;
}

export default async function ProjectTakeoffWorkspacePage({ params }: PageProps) {
  const { projectId, analysisId } = await params;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
      <TakeoffOwnerClient projectId={projectId} analysisId={analysisId} />
    </div>
  );
}
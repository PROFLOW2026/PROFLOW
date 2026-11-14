import { TakeoffOwnerClient } from './takeoff-owner-client';

interface PageProps {
  params: Promise<{ projectId: string }>;
}

/** Owner app: electrical smart BOQ — shared UI, capabilities from analysis permissions. */
export default async function ProjectTakeoffListPage({ params }: PageProps) {
  const { projectId } = await params;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
      <TakeoffOwnerClient projectId={projectId} />
    </div>
  );
}
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SkeletonText } from '@/components/ui/skeleton';
import { ProjectOwnerActualExperience } from '@/modules/financials/ui/project-owner-actual-experience';

export function OverviewFinancialSnapshotFallback() {
  return (
    <Card className="min-w-0 max-w-full">
      <CardHeader className="pb-2">
        <SkeletonText className="h-5 w-40" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <SkeletonText className="h-4 w-full" />
        <SkeletonText className="h-4 w-3/4" />
        <SkeletonText className="h-4 w-2/3" />
      </CardContent>
    </Card>
  );
}

/**
 * Overview money story — same owner Actual / contract / forecast compose as Financials.
 * Do not render a separately gated KPI snapshot that can hide a recognized Actual.
 */
export async function OverviewFinancialSnapshotPanel({ projectId }: { projectId: string }) {
  return <ProjectOwnerActualExperience projectId={projectId} variant="overview" />;
}

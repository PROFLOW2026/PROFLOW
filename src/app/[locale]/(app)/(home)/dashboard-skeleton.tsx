import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';

/** Instant placeholder for the home dashboard while aggregates load. */
export function DashboardSkeleton({
  showTitle = true,
  label,
}: {
  showTitle?: boolean;
  /** Accessible loading announcement (skeletons themselves are aria-hidden). */
  label?: string;
}) {
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6" aria-busy="true" role="status">
      {label ? <span className="sr-only">{label}</span> : null}
      {showTitle ? <Skeleton className="h-8 w-48 max-w-full" /> : null}

      <section className="min-w-0 max-w-full">
        <Skeleton className="mb-3 h-4 w-32" />
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
        </div>
        <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
        </div>
      </section>

      <section className="min-w-0 max-w-full">
        <Skeleton className="mb-3 h-4 w-28" />
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <Card className="min-w-0 max-w-full">
            <CardHeader className="py-3">
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="pb-3">
              <SkeletonText lines={2} />
            </CardContent>
          </Card>
          <Card className="min-w-0 max-w-full">
            <CardHeader className="py-3">
              <Skeleton className="h-5 w-36" />
            </CardHeader>
            <CardContent className="pb-3">
              <SkeletonText lines={2} />
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <Card className="min-w-0 max-w-full">
      <CardHeader className="pb-1">
        <Skeleton className="h-3 w-24" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-7 w-28" />
      </CardContent>
    </Card>
  );
}

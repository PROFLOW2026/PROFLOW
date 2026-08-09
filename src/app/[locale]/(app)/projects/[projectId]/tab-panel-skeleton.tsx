import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';

/** Placeholder while a tab's data loads, sized to roughly match real content. */
export function TabPanelSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <SkeletonText lines={4} />
        </CardContent>
      </Card>
    </div>
  );
}

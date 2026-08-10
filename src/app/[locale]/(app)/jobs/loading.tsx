import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';

export default function JobsLoading() {
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader title={<Skeleton className="h-8 w-40" />} />
      <Skeleton className="h-11 w-full max-w-md" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

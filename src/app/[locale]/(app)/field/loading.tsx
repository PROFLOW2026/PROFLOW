import { SkeletonText } from '@/components/ui/skeleton';

export default function FieldLoading() {
  return (
    <div className="flex flex-col gap-4 p-1" aria-busy="true">
      <SkeletonText className="h-8 w-40" />
      <SkeletonText className="h-4 w-64" />
      <div className="grid grid-cols-2 gap-3">
        <SkeletonText className="min-h-11 rounded-lg" />
        <SkeletonText className="min-h-11 rounded-lg" />
        <SkeletonText className="min-h-11 rounded-lg" />
        <SkeletonText className="min-h-11 rounded-lg" />
      </div>
    </div>
  );
}

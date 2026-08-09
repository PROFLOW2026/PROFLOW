import { Skeleton } from '@/components/ui/skeleton';

export default function SettingsLoading() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-6" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      <div className="flex w-full min-w-0 flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="w-full min-w-0 shrink-0 lg:w-52">
          <div className="flex gap-2 overflow-hidden lg:flex-col lg:gap-1">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-24 shrink-0 lg:w-full" />
            ))}
          </div>
        </aside>

        <div className="min-w-0 max-w-full flex-1">
          <Skeleton className="h-64 w-full max-w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

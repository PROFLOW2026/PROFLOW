'use client';

import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/shared/ui/cn';

/**
 * Non-layout-shifting loading overlay for storage browsers and previews.
 * Parent must be `position: relative` with stable dimensions.
 */
export function StorageLoadingOverlay({
  label,
  className,
  blocking = false,
}: {
  label: string;
  className?: string;
  /** When true, overlay captures pointer events (e.g. share prep). */
  blocking?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        'absolute inset-0 z-20 flex items-center justify-center',
        'bg-[var(--pf-bg-elevated)]/55 backdrop-blur-[1px]',
        blocking ? 'pointer-events-auto' : 'pointer-events-none',
        className,
      )}
    >
      <Spinner className="size-6" label={label} />
    </div>
  );
}

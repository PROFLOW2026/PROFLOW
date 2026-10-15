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
  progress,
}: {
  label: string;
  className?: string;
  /** When true, overlay captures pointer events (e.g. share prep). */
  blocking?: boolean;
  /** Optional 0–1 determinate progress (e.g. CAD load phases). */
  progress?: number;
}) {
  const pct =
    progress !== undefined && Number.isFinite(progress)
      ? Math.min(100, Math.max(0, Math.round(progress * 100)))
      : null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-valuenow={pct ?? undefined}
      aria-valuemin={pct !== null ? 0 : undefined}
      aria-valuemax={pct !== null ? 100 : undefined}
      className={cn(
        'absolute inset-0 z-20 flex items-center justify-center',
        'bg-[var(--pf-bg-elevated)]/55 backdrop-blur-[1px]',
        blocking ? 'pointer-events-auto' : 'pointer-events-none',
        className,
      )}
    >
      <div className="flex w-full max-w-xs flex-col items-center gap-3 px-4">
        <Spinner className="size-6" label={label} />
        {pct !== null ? (
          <div className="w-full">
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--pf-border-default)]">
              <div
                className="h-full rounded-full bg-[var(--pf-accent-default)] transition-[width] duration-200 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1 text-center text-xs text-[var(--pf-text-secondary)]">{pct}%</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

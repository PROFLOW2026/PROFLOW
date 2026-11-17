'use client';

import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/shared/ui/cn';

/**
 * Non-layout-shifting loading overlay for storage browsers and previews.
 * Parent must be `position: relative` with stable dimensions.
 */
export function StorageLoadingOverlay({
  label,
  detail,
  className,
  blocking = false,
  progress,
  onCancel,
  cancelLabel,
}: {
  label: string;
  detail?: string | null;
  className?: string;
  /** When true, overlay captures pointer events (e.g. share prep). */
  blocking?: boolean;
  /** Optional 0–1 determinate progress (e.g. CAD load phases). */
  progress?: number;
  onCancel?: () => void;
  cancelLabel?: string;
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
          <div
            className="w-full"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={label}
          >
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--pf-border-default)]">
              <div
                className="h-full rounded-full bg-[var(--pf-accent-default)] transition-[width] duration-200 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1 text-center text-xs text-[var(--pf-text-secondary)]">{pct}%</p>
          </div>
        ) : null}
        {detail ? <p className="text-center text-xs text-[var(--pf-text-secondary)]">{detail}</p> : null}
        {onCancel ? (
          <button type="button" className="min-h-11 rounded border px-3 text-xs" onClick={onCancel}>
            {cancelLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

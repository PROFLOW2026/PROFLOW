import { MapPin } from 'lucide-react';
import { cn } from '@/shared/ui/cn';

/**
 * Renders a resolved location label (from `resolveLocationLabels` / `formatLocationLabel`).
 * Server- and client-safe (no hooks). Renders nothing for a missing label.
 */
export function LocationLabel({ label, className }: { readonly label: string | null | undefined; readonly className?: string }) {
  if (!label) return null;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1 text-xs text-[var(--pf-text-secondary)]', className)}>
      <MapPin className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate" title={label}>
        {label}
      </span>
    </span>
  );
}

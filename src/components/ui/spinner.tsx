import { Loader2 } from 'lucide-react';
import { cn } from '@/shared/ui/cn';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-2">
      <Loader2 className={cn('size-4 animate-spin text-[var(--pf-text-muted)]', className)} aria-hidden />
      {label ? <span className="text-sm text-[var(--pf-text-secondary)]">{label}</span> : <span className="sr-only">…</span>}
    </span>
  );
}

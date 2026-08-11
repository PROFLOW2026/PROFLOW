'use client';

import { cn } from '@/shared/ui/cn';
import type { DataConfidenceLevel } from '../domain/data-confidence';

export interface DataConfidenceBadgeProps {
  readonly level: DataConfidenceLevel;
  /** Translated short label: High / Medium / Needs data */
  readonly label: string;
  /** Optional translated reason list for title/tooltip. */
  readonly title?: string;
  readonly className?: string;
}

/**
 * Deterministic DATA CONFIDENCE chip — High / Medium / Needs data.
 * Never an AI score; level comes from domain/data-confidence.ts.
 */
export function DataConfidenceBadge({
  level,
  label,
  title,
  className,
}: DataConfidenceBadgeProps) {
  return (
    <span
      data-testid="data-confidence-badge"
      data-level={level}
      title={title}
      className={cn(
        'inline-flex max-w-full items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        level === 'high' &&
          'border-[var(--pf-status-success-border,var(--pf-border-default))] bg-[var(--pf-status-success-bg,var(--pf-bg-muted))] text-[var(--pf-status-success-fg,var(--pf-text-primary))]',
        level === 'medium' &&
          'border-[var(--pf-status-warning-border,var(--pf-border-default))] bg-[var(--pf-status-warning-bg,var(--pf-bg-muted))] text-[var(--pf-status-warning-fg,var(--pf-text-primary))]',
        level === 'needs_data' &&
          'border-[var(--pf-status-danger-border,var(--pf-border-default))] bg-[var(--pf-status-danger-bg,var(--pf-bg-muted))] text-[var(--pf-status-danger-fg,var(--pf-text-primary))]',
        className,
      )}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

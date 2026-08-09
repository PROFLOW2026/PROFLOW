'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { LtrIsland, rtlFlipClassName } from '@/shared/i18n/ltr-island';
import { cn } from '@/shared/ui/cn';

export interface PaginationProps extends React.HTMLAttributes<HTMLElement> {
  /** 1-based page index. */
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  previousLabel?: string;
  nextLabel?: string;
  /** Optional status text shown between controls (page numbers stay LTR). */
  statusLabel?: string;
}

/**
 * Prev/next pagination with mirrored directional chevrons (doc 58 §5).
 * Page numerals render as an LTR island so “3 / 12” never reverses.
 */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  previousLabel = 'Previous',
  nextLabel = 'Next',
  statusLabel,
  className,
  ...props
}: PaginationProps) {
  const safeCount = Math.max(1, pageCount);
  const safePage = Math.min(Math.max(1, page), safeCount);
  const canPrev = safePage > 1;
  const canNext = safePage < safeCount;

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex flex-wrap items-center justify-between gap-3', className)}
      {...props}
    >
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={!canPrev}
        aria-label={previousLabel}
        onClick={() => onPageChange(safePage - 1)}
      >
        <ChevronLeft className={rtlFlipClassName('size-4')} aria-hidden />
        <span className="hidden sm:inline">{previousLabel}</span>
      </Button>

      <LtrIsland className="text-sm text-[var(--pf-text-secondary)] tabular-nums">
        {statusLabel ?? `${safePage} / ${safeCount}`}
      </LtrIsland>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={!canNext}
        aria-label={nextLabel}
        onClick={() => onPageChange(safePage + 1)}
      >
        <span className="hidden sm:inline">{nextLabel}</span>
        <ChevronRight className={rtlFlipClassName('size-4')} aria-hidden />
      </Button>
    </nav>
  );
}

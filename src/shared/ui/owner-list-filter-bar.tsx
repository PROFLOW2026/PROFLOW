'use client';

import { useState } from 'react';
import { cn } from '@/shared/ui/cn';
import {
  uwmActiveChipClass,
  uwmActiveFilterBannerClass,
  uwmFilterPanelClass,
  uwmFilterTitleClass,
  uwmPrimaryButtonClass,
  uwmSecondaryButtonClass,
} from '@/shared/ui/uwm-surface-styles';

interface OwnerListFilterBarProps {
  readonly title: string;
  readonly applyLabel: string;
  readonly clearLabel: string;
  readonly activeLabel: string;
  readonly mobileLabel: string;
  readonly mobileWithCountLabel?: string;
  readonly activeCount: number;
  readonly isActive: boolean;
  readonly activeSummary: readonly string[];
  readonly onApply: () => void;
  readonly onClear: () => void;
  readonly children: React.ReactNode;
}

export function OwnerListFilterBar({
  title,
  applyLabel,
  clearLabel,
  activeLabel,
  mobileLabel,
  mobileWithCountLabel,
  activeCount,
  isActive,
  activeSummary,
  onApply,
  onClear,
  children,
}: OwnerListFilterBarProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className={uwmFilterPanelClass} aria-label={title}>
      <div className="flex items-start justify-between gap-3">
        <h2 className={uwmFilterTitleClass}>{title}</h2>
        {isActive ? (
          <span className="shrink-0 rounded-full bg-[var(--pf-teal-100)] px-2.5 py-1 text-xs font-semibold text-[var(--pf-teal-900)]">
            {activeLabel}
          </span>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 lg:hidden">
        <button type="button" className={uwmSecondaryButtonClass} onClick={() => setOpen((v) => !v)}>
          {activeCount > 0 && mobileWithCountLabel
            ? mobileWithCountLabel
            : mobileLabel}
        </button>
      </div>

      <div className={cn('space-y-3', !open && 'hidden lg:block')}>{children}</div>

      <div
        className={cn(
          'flex flex-wrap items-center gap-2 border-t border-[var(--pf-border-default)] pt-3',
          !open && 'hidden lg:flex',
        )}
      >
        <button type="button" className={uwmPrimaryButtonClass} onClick={onApply}>
          {applyLabel}
        </button>
        <button type="button" className={uwmSecondaryButtonClass} onClick={onClear} disabled={!isActive}>
          {clearLabel}
        </button>
      </div>

      {isActive ? (
        <div className={uwmActiveFilterBannerClass}>
          <span className="text-xs font-semibold text-[var(--pf-teal-900)]">{activeLabel}</span>
          {activeSummary.map((chip) => (
            <span key={chip} className={uwmActiveChipClass}>
              {chip}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function OwnerFilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-[var(--pf-text-secondary)]">{label}</span>
      {children}
    </label>
  );
}

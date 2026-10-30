'use client';

import { useState } from 'react';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import {
  uwmActiveChipClass,
  uwmActiveFilterBannerClass,
  uwmFilterPanelClass,
  uwmFilterPanelCompactClass,
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
  /** When `submit`, the apply control submits the wrapping `<form>`. */
  readonly applyButtonType?: 'button' | 'submit';
  /** When set, clear navigates here instead of calling `onClear`. */
  readonly clearHref?: string;
  /** When true, advanced filters stay collapsed until opened (all breakpoints). */
  readonly collapseDesktop?: boolean;
  /** Lighter panel chrome (work hubs). */
  readonly compact?: boolean;
  /** Hide visible title when toolbar supplies primary affordance (title stays on `aria-label`). */
  readonly suppressTitle?: boolean;
  /** Always visible, on the same row as the mobile filter button. */
  readonly toolbar?: React.ReactNode;
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
  applyButtonType = 'button',
  clearHref,
  collapseDesktop = false,
  compact = false,
  suppressTitle = false,
  toolbar,
  children,
}: OwnerListFilterBarProps) {
  const [open, setOpen] = useState(false);
  const showFilterToggle = Boolean(toolbar) || collapseDesktop;
  const advancedPanelClass = !open
    ? collapseDesktop
      ? 'hidden'
      : 'hidden lg:block'
    : undefined;
  const advancedFooterClass = !open
    ? collapseDesktop
      ? 'hidden'
      : 'hidden lg:flex'
    : undefined;

  const panelClass = compact ? uwmFilterPanelCompactClass : uwmFilterPanelClass;

  return (
    <section className={panelClass} aria-label={title}>
      {suppressTitle ? null : (
        <div className="flex items-start justify-between gap-2">
          <h2 className={cn(uwmFilterTitleClass, compact && 'text-sm')}>{title}</h2>
          {isActive ? (
            <span className="shrink-0 rounded-full bg-[var(--pf-teal-100)] px-2.5 py-1 text-xs font-semibold text-[var(--pf-teal-900)]">
              {activeLabel}
            </span>
          ) : null}
        </div>
      )}

      <div
        className={cn(
          'flex min-w-0 items-center gap-2',
          !showFilterToggle && 'lg:hidden',
        )}
      >
        {toolbar ? <div className="min-w-0 flex-1">{toolbar}</div> : null}
        <button
          type="button"
          className={cn(uwmSecondaryButtonClass, 'shrink-0', !showFilterToggle && 'lg:hidden')}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={showFilterToggle ? open : true}
        >
          {activeCount > 0 && mobileWithCountLabel ? mobileWithCountLabel : mobileLabel}
        </button>
      </div>

      <div className={cn('space-y-3', advancedPanelClass)}>{children}</div>

      <div
        className={cn(
          'flex flex-wrap items-center gap-2 border-t border-[var(--pf-border-default)]',
          compact ? 'pt-2' : 'pt-3',
          advancedFooterClass,
        )}
      >
        <button
          type={applyButtonType}
          className={uwmPrimaryButtonClass}
          onClick={applyButtonType === 'button' ? onApply : undefined}
        >
          {applyLabel}
        </button>
        {clearHref ? (
          <Link
            href={clearHref}
            className={cn(
              uwmSecondaryButtonClass,
              'inline-flex items-center',
              !isActive && 'pointer-events-none opacity-50',
            )}
            aria-disabled={!isActive}
            tabIndex={isActive ? 0 : -1}
          >
            {clearLabel}
          </Link>
        ) : (
          <button type="button" className={uwmSecondaryButtonClass} onClick={onClear} disabled={!isActive}>
            {clearLabel}
          </button>
        )}
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

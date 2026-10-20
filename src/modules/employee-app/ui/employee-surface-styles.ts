/** Employee App surface classes — Deep Teal tokens, RTL-first composition. */

import {
  uwmActiveChipClass,
  uwmActiveFilterBannerClass,
  uwmFilterTitleClass,
  uwmFilterInputClass,
  uwmFilterPanelClass,
  uwmPrimaryButtonClass,
  uwmSecondaryButtonClass,
  uwmSectionHeadingClass,
  uwmTabBarClass,
  uwmTabClass,
} from '@/shared/ui/uwm-surface-styles';

/** Page vertical rhythm for list/form screens (document scroll). */
export const employeePageStackClass = 'flex flex-col gap-5 md:gap-6';

/** Denser office/management list pages on desktop. */
export const employeeOfficePageStackClass = 'flex flex-col gap-3 md:gap-4';

export const employeePanelClass =
  'rounded-2xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 shadow-[var(--pf-shadow-sm)] md:p-5';

export const employeePanelElevatedClass =
  'rounded-2xl border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] p-4 shadow-[var(--pf-shadow-md)] md:p-5';

export const employeeSectionTitleClass = uwmSectionHeadingClass;

export const employeePageTitleClass =
  'text-xl font-bold tracking-tight text-[var(--pf-text-primary)] md:text-2xl';

export const employeePageSubtitleClass =
  'mt-1 text-sm leading-relaxed text-[var(--pf-text-secondary)]';

/** List container — refined divider + strong border for hierarchy. */
export const employeeListPanelClass =
  'overflow-hidden rounded-2xl border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] shadow-[var(--pf-shadow-sm)] divide-y divide-[var(--pf-border-default)]';

/** Denser desktop office lists. */
export const employeeOfficeListPanelClass =
  'overflow-hidden rounded-xl border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] shadow-[var(--pf-shadow-sm)] divide-y divide-[var(--pf-border-default)] md:rounded-lg';

export const employeeListRowLinkClass =
  'block px-4 py-3.5 transition-colors hover:bg-[var(--pf-bg-subtle)] active:bg-[var(--pf-action-subtle-active)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--pf-focus-ring)] md:px-5 md:py-3';

export const employeeListRowClass =
  'flex items-center gap-3 bg-[var(--pf-bg-surface)] px-4 py-3.5 text-sm transition-colors hover:bg-[var(--pf-bg-subtle)] md:px-5 md:py-2.5';

export const employeeFilterBarClass = uwmFilterPanelClass;

export const employeeFilterInputClass = uwmFilterInputClass;

export const employeeFilterSelectClass = uwmFilterInputClass;

export const employeeTabBarClass = uwmTabBarClass;

export const employeeTabClass = uwmTabClass;

export const employeePrimaryButtonClass = uwmPrimaryButtonClass;

export const employeeSecondaryButtonClass = uwmSecondaryButtonClass;

export const employeeActiveChipClass = uwmActiveChipClass;

export const employeeActiveFilterBannerClass = uwmActiveFilterBannerClass;

export const employeeFilterTitleClass = uwmFilterTitleClass;

export const employeeStatCardClass =
  'rounded-2xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3.5 shadow-[var(--pf-shadow-sm)] md:p-4';

export const employeeStatCardAccentClass =
  'rounded-2xl border border-[color-mix(in_srgb,var(--pf-text-brand)_35%,var(--pf-border-default))] bg-[var(--pf-accent-soft)] p-3.5 shadow-[var(--pf-shadow-sm)] md:p-4';

export const employeeHubCardClass =
  'flex items-center justify-between gap-3 rounded-2xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4 py-3.5 shadow-[var(--pf-shadow-sm)] transition-colors hover:border-[var(--pf-border-strong)] hover:bg-[var(--pf-bg-subtle)] active:bg-[var(--pf-action-subtle-active)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)] md:px-5 md:py-4';

export const employeeQuickLinkClass =
  'flex items-center gap-3 rounded-2xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4 py-3 shadow-[var(--pf-shadow-sm)] transition-colors hover:border-[var(--pf-border-strong)] hover:bg-[var(--pf-bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]';

export const employeeScopeBarClass =
  'flex gap-1 rounded-xl border border-[var(--pf-border-strong)] bg-[var(--pf-bg-muted)] p-1 shadow-sm';

export function employeeScopeTabClass(active: boolean): string {
  return active
    ? 'flex-1 rounded-lg border border-transparent bg-[var(--pf-action-primary)] px-3 py-2 text-center text-sm font-semibold text-[var(--pf-action-primary-fg)] shadow-sm'
    : 'flex-1 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 py-2 text-center text-sm font-medium text-[var(--pf-text-primary)] shadow-sm transition-colors hover:bg-[var(--pf-bg-subtle)]';
}

export const employeeMetaChipClass =
  'inline-flex items-center rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-2 py-0.5 text-xs font-medium text-[var(--pf-text-secondary)]';

export const employeeBadgeNeutralClass =
  'inline-flex items-center rounded-full bg-[var(--pf-bg-muted)] px-2 py-0.5 text-xs font-medium text-[var(--pf-text-secondary)]';

export const employeeBadgeAccentClass =
  'inline-flex items-center rounded-full bg-[var(--pf-accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--pf-accent)]';

export const employeeBadgeDangerClass =
  'inline-flex items-center rounded-full bg-[var(--pf-status-danger-bg)] px-2 py-0.5 text-xs font-medium text-[var(--pf-status-danger-fg)]';

export const employeeBadgeWarningClass =
  'inline-flex items-center rounded-full bg-[var(--pf-status-warning-bg)] px-2 py-0.5 text-xs font-medium text-[var(--pf-status-warning-fg)]';

export const employeeBadgeSuccessClass =
  'inline-flex items-center rounded-full bg-[var(--pf-status-success-bg)] px-2 py-0.5 text-xs font-medium text-[var(--pf-status-success-fg)]';

export const employeeIconTileClass =
  'flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--pf-accent-soft)] text-[var(--pf-text-brand)]';

export const employeeIconTileMutedClass =
  'flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--pf-bg-muted)] text-[var(--pf-text-secondary)]';

/**
 * Opt-in nested scroll for kanban / viewer surfaces only.
 * Normal list/form pages should use document scroll (shell does not nest overflow-y).
 */
export const employeeBoardScrollRegionClass =
  'min-h-0 w-full overflow-x-auto overflow-y-visible pb-2';

/** Consistent lucide size in employee chrome. */
export const employeeIconSmClass = 'size-4 shrink-0';
export const employeeIconMdClass = 'size-5 shrink-0';

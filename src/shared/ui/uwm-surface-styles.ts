/** Shared UWM / Employee list surface classes — aligned with main ProjectFlow hierarchy. */

export const uwmPrimaryPanelClass =
  'rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 shadow-[var(--pf-shadow-sm)]';

export const uwmSecondaryPanelClass =
  'rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 shadow-[var(--pf-shadow-sm)]';

export const uwmFilterPanelClass =
  'space-y-4 rounded-xl border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] p-4 shadow-[var(--pf-shadow-md)]';

export const uwmListPanelClass =
  'overflow-hidden rounded-xl border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] shadow-[var(--pf-shadow-sm)] divide-y divide-[var(--pf-border-default)]';

export const uwmListRowClass =
  'bg-[var(--pf-bg-surface)] px-4 py-3.5 text-sm transition-colors hover:bg-[var(--pf-bg-subtle)]';

export const uwmStatCardClass =
  'flex flex-col gap-1 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 shadow-[var(--pf-shadow-sm)] transition-colors hover:bg-[var(--pf-bg-subtle)]';

export const uwmSectionHeadingClass =
  'text-sm font-semibold uppercase tracking-wide text-[var(--pf-text-secondary)]';

export const uwmPageHeadingClass = 'text-base font-semibold text-[var(--pf-text-primary)]';

export const uwmFilterTitleClass = 'text-base font-semibold text-[var(--pf-text-primary)]';

export const uwmFilterInputClass =
  'flex h-11 w-full rounded-md border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] px-3 text-sm text-[var(--pf-text-primary)] shadow-sm focus:border-[var(--pf-border-focus)] focus:outline-2 focus:outline-offset-0 focus:outline-[var(--pf-focus-ring)]';

export const uwmTabBarClass =
  'flex gap-1 overflow-hidden rounded-lg border border-[var(--pf-border-strong)] bg-[var(--pf-bg-muted)] p-1 shadow-[var(--pf-shadow-sm)]';

export function uwmTabClass(active: boolean): string {
  return active
    ? 'flex-1 rounded-md border border-transparent bg-[var(--pf-action-primary)] py-2.5 text-center text-sm font-semibold text-[var(--pf-action-primary-fg)] shadow-sm'
    : 'flex-1 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] py-2.5 text-center text-sm font-medium text-[var(--pf-text-primary)] shadow-sm transition-colors hover:bg-[var(--pf-bg-subtle)]';
}

export const uwmPrimaryButtonClass =
  'inline-flex min-h-[44px] min-w-[5.5rem] items-center justify-center rounded-lg border border-transparent bg-[var(--pf-action-primary)] px-5 py-2 text-sm font-semibold text-[var(--pf-action-primary-fg)] shadow-sm transition-colors hover:bg-[var(--pf-action-primary-hover)] active:bg-[var(--pf-action-primary-active)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50';

export const uwmSecondaryButtonClass =
  'inline-flex min-h-[44px] min-w-[5.5rem] items-center justify-center rounded-lg border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] px-5 py-2 text-sm font-medium text-[var(--pf-text-primary)] shadow-sm transition-colors hover:bg-[var(--pf-bg-subtle)] active:bg-[var(--pf-action-secondary-active)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50';

export const uwmActiveChipClass =
  'inline-flex items-center rounded-full border border-[var(--pf-teal-200)] bg-[var(--pf-teal-50)] px-2.5 py-1 text-xs font-medium text-[var(--pf-teal-900)]';

export const uwmActiveFilterBannerClass =
  'flex flex-wrap items-center gap-2 rounded-lg border border-[var(--pf-teal-200)] bg-[var(--pf-teal-50)] px-3 py-2';

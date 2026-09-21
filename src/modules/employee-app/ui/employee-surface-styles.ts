/** Shared Employee App surface classes aligned with main ProjectFlow tokens. */

import {
  uwmActiveChipClass,
  uwmActiveFilterBannerClass,
  uwmFilterTitleClass,
  uwmFilterInputClass,
  uwmFilterPanelClass,
  uwmListPanelClass,
  uwmListRowClass,
  uwmPrimaryButtonClass,
  uwmPrimaryPanelClass,
  uwmSecondaryButtonClass,
  uwmSectionHeadingClass,
  uwmTabBarClass,
  uwmTabClass,
} from '@/shared/ui/uwm-surface-styles';

export const employeePageStackClass = 'flex flex-col gap-4';

export const employeePanelClass = uwmPrimaryPanelClass;

export const employeeSectionTitleClass = uwmSectionHeadingClass;

export const employeeListPanelClass = uwmListPanelClass;

export const employeeListRowLinkClass =
  'block px-4 py-3 transition-colors hover:bg-[var(--pf-bg-subtle)] active:bg-[var(--pf-action-subtle-active)]';

export const employeeListRowClass = uwmListRowClass;

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
  'rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3 shadow-[var(--pf-shadow-sm)]';

export const employeeHubCardClass =
  'flex items-center justify-between gap-3 rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4 py-4 shadow-[var(--pf-shadow-sm)] transition-colors hover:bg-[var(--pf-bg-subtle)] active:bg-[var(--pf-action-subtle-active)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]';

export const employeeScopeBarClass =
  'flex gap-1 rounded-lg border border-[var(--pf-border-strong)] bg-[var(--pf-bg-muted)] p-1 shadow-sm';

export function employeeScopeTabClass(active: boolean): string {
  return active
    ? 'flex-1 rounded-md border border-transparent bg-[var(--pf-action-primary)] px-3 py-2 text-center text-sm font-semibold text-[var(--pf-action-primary-fg)] shadow-sm'
    : 'flex-1 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 py-2 text-center text-sm font-medium text-[var(--pf-text-primary)] shadow-sm transition-colors hover:bg-[var(--pf-bg-subtle)]';
}

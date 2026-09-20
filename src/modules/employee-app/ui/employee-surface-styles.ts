/** Shared Employee App surface classes aligned with main ProjectFlow tokens. */

export const employeePageStackClass = 'flex flex-col gap-4';

export const employeePanelClass =
  'rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 shadow-sm';

export const employeeSectionTitleClass =
  'text-sm font-semibold uppercase tracking-wide text-[var(--pf-text-secondary)]';

export const employeeListPanelClass =
  'overflow-hidden rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] shadow-sm divide-y divide-[var(--pf-border-default)]';

export const employeeListRowLinkClass =
  'block px-4 py-3 transition-colors hover:bg-[var(--pf-bg-subtle)] active:bg-[var(--pf-action-subtle-active)]';

export const employeeListRowClass =
  'px-4 py-3 text-sm transition-colors hover:bg-[var(--pf-bg-subtle)]';

export const employeeFilterBarClass =
  'space-y-3 rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3 shadow-sm';

export const employeeFilterInputClass =
  'flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm focus:border-[var(--pf-border-focus)] focus:outline-2 focus:outline-offset-0 focus:outline-[var(--pf-focus-ring)]';

export const employeeFilterSelectClass = employeeFilterInputClass;

export const employeeTabBarClass =
  'flex overflow-hidden rounded-lg border border-[var(--pf-border-default)] text-sm font-medium shadow-sm';

export function employeeTabClass(active: boolean): string {
  return active
    ? 'flex-1 bg-[var(--pf-primary)] py-2.5 text-center text-white'
    : 'flex-1 bg-[var(--pf-bg-surface)] py-2.5 text-center text-[var(--pf-text-secondary)] transition-colors hover:bg-[var(--pf-bg-subtle)]';
}

export const employeePrimaryButtonClass =
  'min-h-[44px] rounded-lg bg-[var(--pf-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--pf-primary-hover)] active:bg-[var(--pf-primary-active)] disabled:cursor-not-allowed disabled:opacity-50';

export const employeeSecondaryButtonClass =
  'min-h-[44px] rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4 py-2 text-sm font-medium text-[var(--pf-text-primary)] transition-colors hover:bg-[var(--pf-bg-subtle)] active:bg-[var(--pf-action-subtle-active)] disabled:cursor-not-allowed disabled:opacity-50';

import { cn } from '@/shared/ui/cn';

/**
 * Contractor portal visual system — Deep Teal, Hebrew-first RTL-safe.
 * Desktop uses a real content column (not a stretched phone). Mobile keeps useful cards.
 *
 * Scroll model (mirrors employee shell):
 * - Document/body is the single scroll root for list/form pages.
 * - Do NOT put overflow-y-auto on <main> inside an h-svh overflow-hidden frame.
 * - Side nav may scroll independently when the nav list is long.
 * - Plan viewers opt out of max-width; local scroll only when the viewer needs it.
 */

/** Mobile-comfortable column; desktop opens to a SaaS-width canvas. */
export const portalMainWidthClass = 'w-full max-w-lg md:max-w-5xl lg:max-w-6xl xl:max-w-7xl';

export const portalPlanViewerWidthClass = 'w-full max-w-none';

export const portalPageStackClass = 'flex min-w-0 flex-col gap-5 md:gap-6';

export const portalPageHeaderClass = 'space-y-1.5';

export const portalPageTitleClass =
  'text-2xl font-bold tracking-tight text-[var(--pf-text-primary)] md:text-[1.75rem]';

export const portalPageSubtitleClass = 'max-w-2xl text-sm leading-relaxed text-[var(--pf-text-secondary)]';

export const portalSectionLabelClass =
  'text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--pf-text-muted)]';

export const portalPanelClass =
  'rounded-2xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 shadow-[var(--pf-shadow-sm)] md:p-5';

export const portalPanelElevatedClass =
  'rounded-2xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 shadow-[var(--pf-shadow-md)] md:p-5';

export const portalHeroClass =
  'relative w-full overflow-hidden rounded-2xl border border-[var(--pf-teal-200)] bg-[linear-gradient(135deg,var(--pf-teal-50)_0%,color-mix(in_srgb,var(--pf-teal-50)_78%,var(--pf-bg-surface))_55%,color-mix(in_srgb,var(--pf-teal-100)_55%,var(--pf-bg-surface))_100%)] p-5 shadow-[var(--pf-shadow-sm)] md:p-6';

export const portalListPanelClass =
  'overflow-hidden rounded-2xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] shadow-[var(--pf-shadow-sm)] divide-y divide-[var(--pf-border-default)]';

export const portalListRowLinkClass =
  'block px-4 py-3.5 transition-colors hover:bg-[var(--pf-teal-50)]/60 active:bg-[var(--pf-action-subtle-active)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--pf-focus-ring)]';

export const portalHubCardClass = [
  'group flex items-center justify-between gap-3 rounded-2xl border border-[var(--pf-border-default)]',
  'bg-[var(--pf-bg-surface)] px-4 py-4 shadow-[var(--pf-shadow-sm)]',
  'transition-[border-color,box-shadow,background-color] duration-150',
  'hover:border-[var(--pf-teal-200)] hover:bg-[var(--pf-teal-50)]/40 hover:shadow-[var(--pf-shadow-md)]',
  'active:bg-[var(--pf-action-subtle-active)]',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
].join(' ');

export const portalModuleTileClass = [
  'group flex min-h-[4.5rem] flex-col justify-between gap-3 rounded-2xl border border-[var(--pf-border-default)]',
  'bg-[var(--pf-bg-surface)] p-4 shadow-[var(--pf-shadow-sm)]',
  'transition-[border-color,box-shadow,background-color] duration-150',
  'hover:border-[var(--pf-teal-200)] hover:bg-[var(--pf-teal-50)]/40 hover:shadow-[var(--pf-shadow-md)]',
  'active:bg-[var(--pf-action-subtle-active)]',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
].join(' ');

export const portalItemCardClass = [
  'flex flex-col gap-2 rounded-2xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4',
  'shadow-[var(--pf-shadow-sm)] transition-[border-color,box-shadow,background-color] duration-150',
  'hover:border-[var(--pf-teal-200)] hover:shadow-[var(--pf-shadow-md)]',
].join(' ');

export const portalItemCardDangerClass =
  'border-[var(--pf-status-danger-border)] hover:border-[var(--pf-status-danger-border)]';

export const portalMetricGridClass = 'grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3';

export const portalMetricCellClass =
  'rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)]/60 px-3 py-2.5 md:px-3.5';

export const portalStatChipClass =
  'inline-flex items-center gap-1.5 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-1.5 text-sm';

export const portalIconTileClass =
  'flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--pf-teal-50)] text-[var(--pf-accent)] ring-1 ring-[var(--pf-teal-100)]';

export const portalIconTileMutedClass =
  'flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--pf-bg-muted)] text-[var(--pf-text-secondary)]';

export const portalPrimaryButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-transparent bg-[var(--pf-action-primary)] px-5 text-sm font-semibold text-[var(--pf-action-primary-fg)] shadow-sm transition-colors hover:bg-[var(--pf-action-primary-hover)] active:bg-[var(--pf-action-primary-active)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50';

export const portalSecondaryButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] px-5 text-sm font-medium text-[var(--pf-text-primary)] shadow-sm transition-colors hover:bg-[var(--pf-bg-subtle)] active:bg-[var(--pf-action-secondary-active)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50';

export const portalLinkQuietClass =
  'text-sm font-medium text-[var(--pf-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]';

export const portalModuleGridClass = 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 lg:gap-3';

export const portalProjectCardGridClass = 'grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:gap-3';

/**
 * Shared list components switch to a 640px table at `md`. Inside the portal, keep cards
 * until `lg`, where the content column is wide enough for that table.
 */
export const portalWideListClass =
  '[&>div]:max-lg:!hidden [&>ul]:max-lg:!flex [&>ul]:max-lg:flex-col [&>ul]:lg:!hidden';

/** Promotes the external evidence capture control (second button) without a new viewer. */
export const portalExternalCaptureClass = [
  '[&_button]:min-h-11',
  '[&_button:nth-of-type(2)]:!order-first',
  '[&_button:nth-of-type(2)]:!border-transparent',
  '[&_button:nth-of-type(2)]:!bg-[var(--pf-action-primary)]',
  '[&_button:nth-of-type(2)]:!text-[var(--pf-action-primary-fg)]',
].join(' ');

export const portalSegmentBarClass =
  'flex gap-1 rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-1 shadow-[var(--pf-shadow-sm)]';

export function portalSegmentClass(active: boolean): string {
  return cn(
    'inline-flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 text-center text-sm font-medium sm:flex-none sm:px-4',
    active
      ? 'bg-[var(--pf-action-primary)] text-[var(--pf-action-primary-fg)] shadow-sm'
      : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-surface)] hover:text-[var(--pf-text-primary)]',
  );
}

export const portalShellFrameClass = 'flex min-h-svh bg-[var(--pf-bg-page)]';

export const portalShellColumnClass = 'relative flex min-w-0 flex-1 flex-col';

export const portalShellMainClass = cn(
  'mx-auto w-full flex-1 px-4 pt-5 pb-[var(--pf-employee-main-bottom)] md:px-6 md:pt-6 lg:pb-10',
  portalMainWidthClass,
);

export const portalShellMainPlanViewerClass = cn(
  'mx-auto w-full flex-1 px-3 pt-3 pb-[var(--pf-employee-main-bottom)] md:px-4 lg:pb-6',
  portalPlanViewerWidthClass,
);

export const portalTopBarClass =
  'sticky top-0 z-40 flex h-[var(--pf-topbar-height)] w-full shrink-0 items-center gap-2 border-b border-[var(--pf-border-default)] bg-[color-mix(in_srgb,var(--pf-bg-surface)_92%,transparent)] px-4 backdrop-blur-md print:hidden sm:gap-3 supports-[backdrop-filter]:bg-[color-mix(in_srgb,var(--pf-bg-surface)_84%,transparent)]';

export const portalSideNavClass =
  'sticky top-0 hidden h-svh w-[var(--pf-sidebar-width)] shrink-0 flex-col border-e border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] lg:flex print:hidden';

export const portalSideNavLinkClass = (active: boolean): string =>
  cn(
    'group relative flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors',
    active
      ? 'bg-[var(--pf-accent-soft)] text-[var(--pf-accent)]'
      : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-subtle)] hover:text-[var(--pf-text-primary)]',
  );

export const portalSideNavRailClass = (active: boolean): string =>
  cn(
    'absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-[var(--pf-accent)] transition-opacity',
    active ? 'opacity-100' : 'opacity-0',
  );

const PLAN_VIEWER_PATH = /^\/contractor\/projects\/[^/]+\/plans\/[^/]+\/?$/;

export function isPortalPlanViewerPath(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0] ?? pathname;
  return PLAN_VIEWER_PATH.test(path);
}

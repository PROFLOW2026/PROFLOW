import { cn } from '@/shared/ui/cn';

/** Phone column until md, then a moderate desktop width. Plan viewers opt out in the shell. */
export const portalMainWidthClass = 'w-full max-w-lg md:max-w-3xl lg:max-w-4xl';

export const portalPlanViewerWidthClass = 'w-full max-w-none';

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
  'flex gap-1 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-1';

export function portalSegmentClass(active: boolean): string {
  return cn(
    'inline-flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-center text-sm font-medium sm:flex-none sm:px-4',
    active
      ? 'bg-[var(--pf-action-primary)] text-[var(--pf-action-primary-fg)]'
      : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-surface)]',
  );
}

const PLAN_VIEWER_PATH = /^\/contractor\/projects\/[^/]+\/plans\/[^/]+\/?$/;

export function isPortalPlanViewerPath(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0] ?? pathname;
  return PLAN_VIEWER_PATH.test(path);
}

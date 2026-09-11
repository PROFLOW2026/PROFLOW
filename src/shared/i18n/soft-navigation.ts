'use client';

import { usePathname, useRouter } from '@/shared/i18n/navigation';

function pathnameFromHref(href: string): string {
  const withoutQuery = href.split('?')[0]?.split('#')[0] ?? href;
  return withoutQuery.replace(/\/$/, '') || '/';
}

/**
 * Locale-aware router that preserves scroll on same-path query/filter updates.
 * Real page changes still scroll to top unless `scroll` is passed explicitly.
 */
export function useSoftRouter() {
  const router = useRouter();
  const pathname = usePathname();

  const resolveScroll = (href: string, scroll?: boolean) => {
    if (scroll != null) return scroll;
    return pathnameFromHref(href) !== pathnameFromHref(pathname);
  };

  return {
    push(href: string, options?: { scroll?: boolean }) {
      router.push(href, { scroll: resolveScroll(href, options?.scroll) });
    },
    replace(href: string, options?: { scroll?: boolean }) {
      router.replace(href, { scroll: resolveScroll(href, options?.scroll) });
    },
  };
}

/** Default for in-page query navigation links (month arrows, filters, tabs). */
export const preserveScrollOnQueryNav = { scroll: false as const };

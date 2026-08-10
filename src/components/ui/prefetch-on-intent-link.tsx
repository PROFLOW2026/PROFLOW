'use client';

import type { ComponentProps } from 'react';
import { Link, useRouter } from '@/shared/i18n/navigation';

type LinkProps = ComponentProps<typeof Link>;

/**
 * Prefetch on pointer intent, not on mount or focus.
 *
 * Focus-based prefetch raced Playwright click → open-project (focus then
 * click issued a prefetch RSC alongside the navigation flight).
 */
export function PrefetchOnIntentLink({
  href,
  onMouseEnter,
  onPointerDown,
  prefetch = false,
  ...rest
}: LinkProps) {
  const router = useRouter();

  function maybePrefetch() {
    if (typeof href === 'string') {
      router.prefetch(href);
    }
  }

  return (
    <Link
      href={href}
      prefetch={prefetch}
      onMouseEnter={(event) => {
        maybePrefetch();
        onMouseEnter?.(event);
      }}
      onPointerDown={(event) => {
        maybePrefetch();
        onPointerDown?.(event);
      }}
      {...rest}
    />
  );
}

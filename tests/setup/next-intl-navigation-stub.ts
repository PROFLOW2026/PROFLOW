import React from 'react';
import { vi } from 'vitest';

/** Vitest alias for `next-intl/navigation` — avoids pulling Next's `next/navigation` in Node tests. */
export function createNavigation(_routing: unknown) {
  function Link({
    href,
    children,
    ...props
  }: {
    href: string;
    children?: React.ReactNode;
  }) {
    return React.createElement('a', { href, ...props }, children);
  }

  return {
    Link,
    usePathname: () => '/',
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    }),
    getPathname: ({ href }: { locale?: string; href: string }) => href,
    redirect: vi.fn(),
    permanentRedirect: vi.fn(),
  };
}

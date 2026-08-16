'use client';

import dynamic from 'next/dynamic';

const GlobalSearchTrigger = dynamic(
  () => import('./global-search').then((mod) => mod.GlobalSearchTrigger),
  { ssr: false, loading: () => null },
);

/** Shell entry - defers Dialog/search bundle until after paint. */
export function GlobalSearchLazy() {
  return <GlobalSearchTrigger />;
}

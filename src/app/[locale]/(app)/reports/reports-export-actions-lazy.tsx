'use client';

import dynamic from 'next/dynamic';

const ReportsExportActions = dynamic(
  () => import('./reports-export-actions').then((mod) => mod.ReportsExportActions),
  {
    ssr: false,
    loading: () => (
      <div
        className="inline-flex h-11 max-w-full min-w-0 animate-pulse rounded-md bg-[var(--pf-bg-muted)] sm:min-w-28"
        aria-hidden
      />
    ),
  },
);

/** Reports toolbar export menu - deferred until the reports route mounts. */
export function ReportsExportActionsLazy() {
  return <ReportsExportActions />;
}

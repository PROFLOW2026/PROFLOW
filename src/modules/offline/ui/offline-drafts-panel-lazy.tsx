'use client';

import dynamic from 'next/dynamic';
import { Spinner } from '@/components/ui/spinner';

const OfflineDraftsPanel = dynamic(
  () => import('./offline-drafts-panel').then((mod) => mod.OfflineDraftsPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-48 items-center justify-center rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4 py-10">
        <Spinner />
      </div>
    ),
  },
);

/** Settings-only island — keep draft queue UI out of the shared shell graph. */
export function OfflineDraftsPanelLazy({ organizationId }: { organizationId: string }) {
  return <OfflineDraftsPanel organizationId={organizationId} />;
}

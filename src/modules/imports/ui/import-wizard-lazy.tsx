'use client';

import dynamic from 'next/dynamic';
import { Spinner } from '@/components/ui/spinner';
import type { ImportWizardProps } from './import-wizard';

const ImportWizard = dynamic(
  () => import('./import-wizard').then((mod) => mod.ImportWizard),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-48 items-center justify-center rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4 py-10">
        <Spinner />
      </div>
    ),
  },
);

/** Route-level island - keeps the heavy wizard out of shared app shells. */
export function ImportWizardLazy(props: ImportWizardProps) {
  return <ImportWizard {...props} />;
}

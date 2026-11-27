'use client';

import { useState, type ReactNode } from 'react';
import { useMountedDesign } from '../use-mounted-design';

/**
 * List chrome. The table stays the first child in every design so a switch
 * does not remount filters. V10 adds the column fold after it; CSS shows the
 * control first.
 */
export function DesignListShell({ children, className }: { children: ReactNode; className?: string }) {
  const design = useMountedDesign();
  const [open, setOpen] = useState(false);
  const variantClass =
    design === 'v9' ? 'pf-design-v9-table' : design === 'v10' ? 'pf-design-v10-scan' : '';
  return (
    <div
      data-pf-slot="table-shell"
      data-pf-ma-table-shell=""
      data-pf-design-list={design}
      data-pf-design-landmark={design === 'v9' ? 'v9-table' : design === 'v10' ? 'v10-scan' : undefined}
      data-pf-design-fold={design === 'v10' ? (open ? 'open' : 'closed') : undefined}
      className={[variantClass, className].filter(Boolean).join(' ') || undefined}
    >
      {children}
      {design === 'v10' ? (
        <button
          type="button"
          className="pf-design-fold-toggle"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'הסתר עמודות משניות' : 'עמודות משניות'}
        </button>
      ) : null}
    </div>
  );
}

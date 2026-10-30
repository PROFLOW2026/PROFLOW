'use client';

import type { ReactNode } from 'react';
import { OwnerListFilterBar } from '@/shared/ui/owner-list-filter-bar';

export interface MainAppOrgListFilterPanelProps {
  readonly title: string;
  readonly applyLabel: string;
  readonly clearLabel: string;
  readonly clearHref: string;
  readonly activeLabel: string;
  readonly mobileLabel: string;
  readonly mobileWithCountLabel?: string;
  readonly activeCount: number;
  readonly isActive: boolean;
  readonly activeSummary: readonly string[];
  readonly hiddenFields?: ReactNode;
  readonly toolbar?: ReactNode;
  readonly collapseDesktop?: boolean;
  readonly children: ReactNode;
}

/** GET list filters with collapsed advanced panel and optional always-visible toolbar. */
export function MainAppOrgListFilterPanel({
  hiddenFields,
  clearHref,
  collapseDesktop = true,
  ...barProps
}: MainAppOrgListFilterPanelProps) {
  return (
    <form method="get" className="min-w-0 max-w-full">
      {hiddenFields}
      <OwnerListFilterBar
        {...barProps}
        clearHref={clearHref}
        collapseDesktop={collapseDesktop}
        applyButtonType="submit"
        onApply={() => undefined}
        onClear={() => undefined}
      />
    </form>
  );
}

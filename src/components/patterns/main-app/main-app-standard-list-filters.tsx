'use client';

import type { ReactNode } from 'react';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { OwnerListFilterBar } from '@/shared/ui/owner-list-filter-bar';

export interface MainAppStandardListFiltersProps {
  readonly title: string;
  readonly applyLabel: string;
  readonly clearLabel: string;
  readonly activeLabel: string;
  readonly mobileLabel: string;
  readonly mobileWithCountLabel?: string;
  readonly searchLabel: string;
  readonly searchPlaceholder: string;
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly activeCount: number;
  readonly isActive: boolean;
  readonly activeSummary: readonly string[];
  readonly onApply: () => void;
  readonly onClear: () => void;
  readonly advancedFilters: ReactNode;
}

/**
 * Shared owner list filter chrome: always-visible search + collapsed advanced panel
 * (Main App kit + OwnerListFilterBar).
 */
export function MainAppStandardListFilters({
  title,
  applyLabel,
  clearLabel,
  activeLabel,
  mobileLabel,
  mobileWithCountLabel,
  searchLabel,
  searchPlaceholder,
  query,
  onQueryChange,
  activeCount,
  isActive,
  activeSummary,
  onApply,
  onClear,
  advancedFilters,
}: MainAppStandardListFiltersProps) {
  const searchField = (
    <Field
      label={<span className="sr-only">{searchLabel}</span>}
      className="min-w-0 flex flex-1 flex-col gap-0"
    >
      {(control) => (
        <Input
          {...control}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchLabel}
          className="min-w-0"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onApply();
            }
          }}
        />
      )}
    </Field>
  );

  return (
    <OwnerListFilterBar
      title={title}
      applyLabel={applyLabel}
      clearLabel={clearLabel}
      activeLabel={activeLabel}
      mobileLabel={mobileLabel}
      mobileWithCountLabel={mobileWithCountLabel}
      activeCount={activeCount}
      isActive={isActive}
      activeSummary={activeSummary}
      onApply={onApply}
      onClear={onClear}
      collapseDesktop
      toolbar={searchField}
    >
      {advancedFilters}
    </OwnerListFilterBar>
  );
}

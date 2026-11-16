'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CatalogType, ElectricalCategory } from '../domain/contracts';
import { blurSelectOnWheel } from './blur-select-on-wheel';
import { CATALOG_CATEGORY_ORDER, filterCatalog, groupCatalog } from './review-guide';

export function TakeoffTypePicker({
  catalog,
  value,
  onChange,
  disabled,
  testId,
}: {
  catalog: readonly CatalogType[];
  value: string;
  onChange: (typeKey: string) => void;
  disabled?: boolean;
  testId: string;
}) {
  const t = useTranslations('takeoff');
  const [category, setCategory] = useState<'all' | ElectricalCategory>('all');
  const [query, setQuery] = useState('');
  const present = useMemo(
    () => CATALOG_CATEGORY_ORDER.filter((item) => catalog.some((type) => type.category === item)),
    [catalog],
  );
  const filtered = useMemo(
    () => filterCatalog(catalog, category, query, value),
    [catalog, category, query, value],
  );
  const grouped = useMemo(() => groupCatalog(filtered), [filtered]);

  return (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className={`min-h-9 rounded-md px-2 text-xs ${category === 'all' ? 'bg-[var(--pf-action-primary-bg)] text-[var(--pf-action-primary-fg)]' : 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-secondary)]'}`}
          onClick={() => setCategory('all')}
        >
          {t('catalogCategory.all')}
        </button>
        {present.map((item) => (
          <button
            key={item}
            type="button"
            className={`min-h-9 rounded-md px-2 text-xs ${category === item ? 'bg-[var(--pf-action-primary-bg)] text-[var(--pf-action-primary-fg)]' : 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-secondary)]'}`}
            onClick={() => setCategory(item)}
          >
            {t(`catalogCategory.${item}`)}
          </button>
        ))}
      </div>
      <input
        type="search"
        value={query}
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('detection.searchTypes')}
        className="min-h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-page)] px-3 text-sm"
      />
      <select
        data-testid={testId}
        className="min-h-11 w-full max-w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-page)] px-2 text-sm"
        value={value}
        disabled={disabled}
        onWheel={blurSelectOnWheel}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t('detection.unclassified')}</option>
        {grouped.map((group) => (
          <optgroup key={group.category} label={t(`catalogCategory.${group.category}`)}>
            {group.types.map((type) => (
              <option key={type.key} value={type.key}>
                {type.nameHe}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import type { CatalogType } from '../domain/contracts';
import type { TypeFilterState } from './workspace/takeoff-workspace-state';
import { useTranslations } from 'next-intl';
import { blurSelectOnWheel } from './blur-select-on-wheel';

export function TakeoffTypeFilterChips({
  catalog,
  filter,
  onChange,
}: {
  catalog: readonly CatalogType[];
  filter: TypeFilterState;
  onChange: (updater: (f: TypeFilterState) => TypeFilterState) => void;
}) {
  const t = useTranslations('takeoff');
  const [query, setQuery] = useState('');

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = catalog.filter((c) => !c.archived);
    const list = q
      ? visible.filter((c) => c.nameHe.toLowerCase().includes(q) || c.key.toLowerCase().includes(q))
      : visible;
    return list.slice(0, 40);
  }, [catalog, query]);

  const active = filter.soloTypeKey ? catalog.find((c) => c.key === filter.soloTypeKey) : null;

  return (
    <div className="flex min-w-0 flex-col gap-1" role="toolbar" aria-label={t('filter.aria')}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <input
          type="search"
          className="min-h-11 min-w-[10rem] flex-1 rounded-md border border-[var(--pf-border-default)] px-2 text-sm"
          placeholder={t('filter.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="min-h-11 max-w-[14rem] flex-1 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-default)] px-2 text-sm"
          value={filter.soloTypeKey ?? ''}
          onWheel={blurSelectOnWheel}
          onChange={(e) => {
            const key = e.target.value || null;
            onChange((f) => ({ ...f, soloTypeKey: key }));
          }}
        >
          <option value="">{t('filter.all')}</option>
          {options.map((c) => (
            <option key={c.key} value={c.key}>
              {c.nameHe}
            </option>
          ))}
        </select>
        {active ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--pf-border-default)] px-2 py-1 text-xs">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: active.colorHex }} aria-hidden />
            {active.nameHe}
          </span>
        ) : null}
      </div>
      {filter.hidden.size > 0 ? (
        <p className="text-[10px] text-[var(--pf-text-muted)]">
          {t('filter.hiddenCount', { count: filter.hidden.size })}
        </p>
      ) : null}
    </div>
  );
}
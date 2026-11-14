'use client';

import type { CatalogType } from '../domain/contracts';
import type { TypeFilterState } from './workspace/takeoff-workspace-state';
import { useTranslations } from 'next-intl';

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

  return (
    <div className="flex min-w-0 flex-wrap gap-1" role="toolbar" aria-label={t('filter.aria')}>
      <button
        type="button"
        className={`min-h-11 rounded-full border px-3 text-xs font-medium ${
          filter.soloTypeKey == null ? 'border-[var(--pf-border-strong)] bg-[var(--pf-bg-muted)]' : 'border-[var(--pf-border-default)]'
        }`}
        onClick={() => onChange((f) => ({ ...f, soloTypeKey: null }))}
      >
        {t('filter.all')}
      </button>
      {catalog.map((c) => {
        const hidden = filter.hidden.has(c.key);
        const solo = filter.soloTypeKey === c.key;
        return (
          <button
            key={c.key}
            type="button"
            className="flex min-h-11 max-w-full items-center gap-2 rounded-full border border-[var(--pf-border-default)] px-3 text-xs"
            style={{ opacity: hidden ? 0.45 : 1 }}
            onClick={() => onChange((f) => ({ ...f, soloTypeKey: solo ? null : c.key }))}
            onContextMenu={(e) => {
              e.preventDefault();
              onChange((f) => {
                const next = new Set(f.hidden);
                if (next.has(c.key)) next.delete(c.key);
                else next.add(c.key);
                return { ...f, hidden: next };
              });
            }}
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.colorHex }} aria-hidden />
            <span className="truncate">{c.nameHe}</span>
          </button>
        );
      })}
      <span className="self-center text-[10px] text-[var(--pf-text-muted)]">{t('filter.hideHint')}</span>
    </div>
  );
}
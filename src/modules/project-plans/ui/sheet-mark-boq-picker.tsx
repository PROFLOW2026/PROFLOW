'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import { cn } from '@/shared/ui/cn';

export type SheetMarkBoqLineOption = {
  readonly id: string;
  readonly itemCode: string | null;
  readonly description: string;
  readonly unit: string | null;
};

export function SheetMarkBoqPicker({
  lines,
  value,
  onChange,
  disabled,
}: {
  readonly lines: readonly SheetMarkBoqLineOption[];
  readonly value: string | null;
  readonly onChange: (id: string | null) => void;
  readonly disabled?: boolean;
}) {
  const t = useTranslations('projectPlans.sheetMarks');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((line) => {
      const hay = `${line.itemCode ?? ''} ${line.description} ${line.unit ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [lines, query]);

  return (
    <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-2 border-0 p-0">
      <Label className="text-sm font-medium">{t('boqPickerLabel')}</Label>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('boqSearch')}
        className="min-h-10 w-full rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
      />
      {lines.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('boqEmpty')}</p>
      ) : (
        <ul className="max-h-48 overflow-y-auto rounded-md border border-[var(--pf-border-default)]">
          <li>
            <button
              type="button"
              className={cn(
                'flex w-full px-3 py-2 text-start text-sm hover:bg-[var(--pf-bg-muted)]',
                value === null ? 'bg-[var(--pf-bg-muted)] font-medium' : '',
              )}
              onClick={() => onChange(null)}
            >
              {t('boqNone')}
            </button>
          </li>
          {filtered.map((line) => (
            <li key={line.id}>
              <button
                type="button"
                className={cn(
                  'flex w-full flex-col gap-0.5 border-t border-[var(--pf-border-default)] px-3 py-2 text-start hover:bg-[var(--pf-bg-muted)]',
                  value === line.id ? 'bg-[var(--pf-bg-muted)]' : '',
                )}
                onClick={() => onChange(line.id)}
              >
                <span className="text-xs text-[var(--pf-text-muted)]">
                  {line.itemCode ?? t('boqNoCode')}
                  {line.unit ? ` · ${line.unit}` : null}
                </span>
                <span className="text-sm font-medium">{line.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

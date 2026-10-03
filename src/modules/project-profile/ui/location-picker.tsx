'use client';

import { useTranslations } from 'next-intl';
import { useId, useMemo, useState } from 'react';
import { inputClassName } from '@/components/ui/input';
import { cn } from '@/shared/ui/cn';
import {
  buildLocationIndex,
  collectSubtreeIds,
  filterLocationEntries,
  flattenLocationTree,
  type LocationNode,
  type LocationType,
} from '../domain/locations';

export interface LocationPickerProps {
  /** Tree of the project (e.g. from `listLocationOptions(context, projectId)`). */
  readonly locations: readonly LocationNode[];
  /** Controlled value. Omit to use `defaultValue` (uncontrolled, e.g. inside a plain form). */
  readonly value?: string | null;
  readonly defaultValue?: string | null;
  readonly onChange?: (locationId: string | null) => void;
  /** Form field name; the selected id (or empty string) is submitted with the form. */
  readonly name?: string;
  readonly id?: string;
  readonly disabled?: boolean;
  readonly required?: boolean;
  /** Offer "no location" (default true). */
  readonly allowNone?: boolean;
  /** Hide these ids and their subtrees (e.g. when moving a location). */
  readonly excludeSubtreesOf?: readonly string[];
  /** Only these types are selectable; others are shown as context but disabled. */
  readonly selectableTypes?: readonly LocationType[];
  /** Show the search box from this many options (default 12). */
  readonly searchThreshold?: number;
  readonly className?: string;
  readonly 'aria-invalid'?: true | undefined;
  readonly 'aria-describedby'?: string;
}

const INDENT = '\u00A0\u00A0\u00A0';

/**
 * Reusable location selector for every track (tasks, defects, inspections, work lines...).
 * Native `<select>` for mobile ergonomics + optional search for large trees. Hebrew-first,
 * RTL safe (indentation uses non-breaking spaces, not CSS padding).
 */
export function LocationPicker({
  locations,
  value,
  defaultValue = null,
  onChange,
  name,
  id,
  disabled,
  required,
  allowNone = true,
  excludeSubtreesOf,
  selectableTypes,
  searchThreshold = 12,
  className,
  ...aria
}: LocationPickerProps) {
  const t = useTranslations('projectProfile');
  const generatedId = useId();
  const controlId = id ?? `${generatedId}-location`;
  const [internal, setInternal] = useState<string | null>(defaultValue);
  const [query, setQuery] = useState('');
  const selected = value === undefined ? internal : value;

  const entries = useMemo(() => {
    const index = buildLocationIndex(locations);
    const excluded = new Set<string>();
    for (const rootId of excludeSubtreesOf ?? []) {
      for (const excludedId of collectSubtreeIds(index, rootId)) excluded.add(excludedId);
    }
    return flattenLocationTree(index).filter((entry) => !excluded.has(entry.node.id));
  }, [locations, excludeSubtreesOf]);

  const filtered = useMemo(() => filterLocationEntries(entries, query), [entries, query]);
  const searching = query.trim().length > 0;
  const selectable = (type: LocationType) => !selectableTypes || selectableTypes.includes(type);

  const handleChange = (next: string) => {
    const resolved = next === '' ? null : next;
    if (value === undefined) setInternal(resolved);
    onChange?.(resolved);
  };

  if (locations.length === 0) {
    return (
      <>
        <p className="text-sm text-[var(--pf-text-muted)]">{t('picker.empty')}</p>
        {name ? <input type="hidden" name={name} value="" /> : null}
      </>
    );
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      {entries.length >= searchThreshold ? (
        <input
          type="search"
          className={inputClassName}
          placeholder={t('picker.search')}
          aria-label={t('picker.search')}
          aria-controls={controlId}
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}
      <select
        id={controlId}
        name={name}
        className={inputClassName}
        value={selected ?? ''}
        disabled={disabled}
        required={required && !allowNone}
        onChange={(event) => handleChange(event.target.value)}
        {...aria}
      >
        {allowNone ? <option value="">{t('picker.none')}</option> : null}
        {selected && !filtered.some((entry) => entry.node.id === selected) ? (
          <option value={selected}>{entries.find((entry) => entry.node.id === selected)?.label ?? selected}</option>
        ) : null}
        {filtered.map((entry) => (
          <option
            key={entry.node.id}
            value={entry.node.id}
            title={entry.label}
            disabled={!selectable(entry.node.type)}
          >
            {searching
              ? entry.label
              : `${INDENT.repeat(entry.depth)}${entry.node.name}${entry.node.code ? ` (${entry.node.code})` : ''}`}
          </option>
        ))}
      </select>
      {searching && filtered.length === 0 ? (
        <p className="text-xs text-[var(--pf-text-muted)]" role="status">
          {t('picker.noResults')}
        </p>
      ) : null}
    </div>
  );
}

'use client';

import { useId, useMemo, useState } from 'react';
import { locationLabel } from '../domain/filters';
import type { InfraLocationOption } from '../domain/types';

export interface FlatLocation {
  readonly id: string;
  readonly label: string;
  readonly depth: number;
}

/** Depth-first order (by sortOrder, then name) with full path labels. */
export function flattenLocations(locations: readonly InfraLocationOption[], options?: { includeArchived?: boolean }): FlatLocation[] {
  const visible = locations.filter((node) => (options?.includeArchived ? true : !node.archived && node.isActive));
  const visibleIds = new Set(visible.map((node) => node.id));
  const children = new Map<string | null, InfraLocationOption[]>();
  for (const node of visible) {
    // A node whose parent is hidden is promoted to the root so it never disappears from the list.
    const parent = node.parentId && visibleIds.has(node.parentId) ? node.parentId : null;
    const list = children.get(parent) ?? [];
    list.push(node);
    children.set(parent, list);
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'he'));
  }
  const result: FlatLocation[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const node of children.get(parent) ?? []) {
      result.push({ id: node.id, label: locationLabel(locations, node.id) ?? node.name, depth });
      if (depth < 40) walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return result;
}

export function InfraLocationSelect({
  locations,
  value,
  onChange,
  label,
  placeholder,
  emptyLabel,
  required,
  testId,
}: {
  readonly locations: readonly InfraLocationOption[];
  readonly value: string | null;
  readonly onChange: (locationId: string | null) => void;
  readonly label: string;
  readonly placeholder: string;
  readonly emptyLabel?: string;
  readonly required?: boolean;
  readonly testId?: string;
}) {
  const id = useId();
  const [filter, setFilter] = useState('');
  const flat = useMemo(() => flattenLocations(locations), [locations]);
  const filtered = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase();
    if (!needle) return flat;
    return flat.filter((item) => item.label.toLocaleLowerCase().includes(needle) || item.id === value);
  }, [filter, flat, value]);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? <span className="text-[var(--pf-status-danger-fg)]"> *</span> : null}
      </label>
      {flat.length > 12 ? (
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-h-11 w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface,white)] px-3 text-sm"
        />
      ) : null}
      <select
        id={id}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        required={required}
        data-testid={testId}
        className="min-h-11 w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface,white)] px-2 text-sm"
      >
        <option value="">{emptyLabel ?? placeholder}</option>
        {filtered.map((item) => (
          <option key={item.id} value={item.id}>
            {`${'\u2003'.repeat(Math.min(item.depth, 4))}${item.label}`}
          </option>
        ))}
      </select>
    </div>
  );
}

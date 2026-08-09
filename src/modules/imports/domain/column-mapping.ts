import { fieldDefsForKind } from './field-defs';
import type { ColumnMapping, ImportKind } from './types';

/** Normalize header for alias matching: lower-case, collapse non-alnum to underscore. */
export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_')
    .replace(/[^\p{L}\p{N}_]+/gu, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Auto-map CSV headers to canonical field keys using aliases.
 * First matching unused column wins; required fields may remain unmapped.
 */
export function autoMapColumns(
  kind: ImportKind,
  headers: readonly string[],
): ColumnMapping {
  const fields = fieldDefsForKind(kind);
  const used = new Set<number>();
  const mapping: Record<string, number> = {};

  for (const field of fields) {
    const aliasSet = new Set(field.aliases.map(normalizeHeader));
    aliasSet.add(normalizeHeader(field.key));

    let found = -1;
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue;
      const norm = normalizeHeader(headers[i] ?? '');
      if (aliasSet.has(norm)) {
        found = i;
        break;
      }
    }

    if (found >= 0) {
      mapping[field.key] = found;
      used.add(found);
    } else {
      mapping[field.key] = -1;
    }
  }

  return mapping;
}

export function applyMapping(
  headers: readonly string[],
  row: readonly string[],
  mapping: ColumnMapping,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [field, index] of Object.entries(mapping)) {
    if (index < 0 || index >= row.length) {
      values[field] = '';
      continue;
    }
    values[field] = (row[index] ?? '').trim();
    void headers;
  }
  return values;
}

/** Validate that mapping indexes are in range; returns corrected mapping. */
export function sanitizeMapping(
  kind: ImportKind,
  headers: readonly string[],
  mapping: ColumnMapping,
): ColumnMapping {
  const fields = fieldDefsForKind(kind);
  const next: Record<string, number> = {};
  for (const field of fields) {
    const raw = mapping[field.key];
    const index = typeof raw === 'number' ? raw : -1;
    next[field.key] = index >= 0 && index < headers.length ? index : -1;
  }
  return next;
}

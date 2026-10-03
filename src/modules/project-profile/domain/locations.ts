/**
 * Location tree + label helpers (pure, client-safe). Rows come from the foundation table
 * `project_locations` (adjacency list per project). Other tracks render a location with
 * `formatLocationLabel(index, id)` and pick one with `<LocationPicker>`.
 */

export const LOCATION_TYPES = [
  'site',
  'building',
  'wing',
  'floor',
  'apartment',
  'unit',
  'room',
  'area',
  'zone',
  'parking',
  'basement',
  'roof',
  'facade',
  'infrastructure',
  'other',
] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

/** DB trigger limit is 32 hops; keep UI trees well inside it. */
export const MAX_LOCATION_DEPTH = 12;
export const DEFAULT_LOCATION_SEPARATOR = ' › ';

export function isLocationType(value: unknown): value is LocationType {
  return typeof value === 'string' && (LOCATION_TYPES as readonly string[]).includes(value);
}

/** Minimal shape needed to build labels and trees (serialisable to the client). */
export interface LocationNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly code: string | null;
  readonly type: LocationType;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly archived: boolean;
}

export interface LocationIndex {
  readonly byId: ReadonlyMap<string, LocationNode>;
  readonly childrenOf: ReadonlyMap<string | null, readonly LocationNode[]>;
}

function compareNodes(a: LocationNode, b: LocationNode): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  const byCode = (a.code ?? '').localeCompare(b.code ?? '', undefined, { numeric: true });
  if (byCode !== 0) return byCode;
  return a.name.localeCompare(b.name, undefined, { numeric: true });
}

export function buildLocationIndex(nodes: readonly LocationNode[]): LocationIndex {
  const byId = new Map<string, LocationNode>();
  for (const node of nodes) byId.set(node.id, node);
  const childrenOf = new Map<string | null, LocationNode[]>();
  for (const node of nodes) {
    // Orphans (parent filtered out) surface at the root instead of disappearing.
    const parentKey = node.parentId && byId.has(node.parentId) ? node.parentId : null;
    const list = childrenOf.get(parentKey) ?? [];
    list.push(node);
    childrenOf.set(parentKey, list);
  }
  for (const list of childrenOf.values()) list.sort(compareNodes);
  return { byId, childrenOf };
}

/** Root-to-node chain. Stops on a (should-be-impossible) cycle. */
export function locationPath(index: LocationIndex, id: string): LocationNode[] {
  const chain: LocationNode[] = [];
  const seen = new Set<string>();
  let cursor = index.byId.get(id) ?? null;
  while (cursor && !seen.has(cursor.id) && chain.length <= MAX_LOCATION_DEPTH * 3) {
    seen.add(cursor.id);
    chain.unshift(cursor);
    cursor = cursor.parentId ? (index.byId.get(cursor.parentId) ?? null) : null;
  }
  return chain;
}

export function locationDepth(index: LocationIndex, id: string): number {
  return Math.max(0, locationPath(index, id).length - 1);
}

/** "Building A › Floor 3 › Apt 12". Returns null for an unknown id. */
export function formatLocationLabel(
  index: LocationIndex,
  id: string | null | undefined,
  options: { readonly separator?: string; readonly withCode?: boolean; readonly leafOnly?: boolean } = {},
): string | null {
  if (!id) return null;
  const path = locationPath(index, id);
  if (path.length === 0) return null;
  const parts = (options.leafOnly ? path.slice(-1) : path).map((node) =>
    options.withCode && node.code ? `${node.name} (${node.code})` : node.name,
  );
  return parts.join(options.separator ?? DEFAULT_LOCATION_SEPARATOR);
}

/** Short code path "B1-F03-A12" when every ancestor has a code; null otherwise. */
export function formatLocationCodePath(index: LocationIndex, id: string, separator = '-'): string | null {
  const path = locationPath(index, id);
  if (path.length === 0 || path.some((node) => !node.code)) return null;
  return path.map((node) => node.code).join(separator);
}

export interface FlatLocationEntry {
  readonly node: LocationNode;
  readonly depth: number;
  readonly label: string;
  readonly hasChildren: boolean;
}

/** Depth-first flattening in display order (for pickers and printable lists). */
export function flattenLocationTree(
  index: LocationIndex,
  options: { readonly includeInactive?: boolean; readonly separator?: string } = {},
): FlatLocationEntry[] {
  const result: FlatLocationEntry[] = [];
  const visit = (parentId: string | null, depth: number, prefix: string[]) => {
    if (depth > MAX_LOCATION_DEPTH * 3) return;
    for (const node of index.childrenOf.get(parentId) ?? []) {
      const visible = options.includeInactive || (node.isActive && !node.archived);
      const path = [...prefix, node.name];
      if (visible) {
        result.push({
          node,
          depth,
          label: path.join(options.separator ?? DEFAULT_LOCATION_SEPARATOR),
          hasChildren: (index.childrenOf.get(node.id)?.length ?? 0) > 0,
        });
        visit(node.id, depth + 1, path);
      }
    }
  };
  visit(null, 0, []);
  return result;
}

/** Ids of `id` and every descendant (for subtree archive). */
export function collectSubtreeIds(index: LocationIndex, id: string): string[] {
  const result: string[] = [];
  const stack = [id];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);
    result.push(next);
    for (const child of index.childrenOf.get(next) ?? []) stack.push(child.id);
  }
  return result;
}

/** True when moving `id` under `newParentId` would create a cycle. */
export function wouldCreateCycle(index: LocationIndex, id: string, newParentId: string | null): boolean {
  if (!newParentId) return false;
  if (newParentId === id) return true;
  return locationPath(index, newParentId).some((node) => node.id === id);
}

/** Case-insensitive search over name / code / full path. */
export function filterLocationEntries(
  entries: readonly FlatLocationEntry[],
  query: string,
): FlatLocationEntry[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...entries];
  return entries.filter(
    (entry) =>
      entry.label.toLocaleLowerCase().includes(needle) ||
      (entry.node.code ?? '').toLocaleLowerCase().includes(needle),
  );
}

/** Next sort order among siblings. */
export function nextSiblingSortOrder(index: LocationIndex, parentId: string | null): number {
  const siblings = index.childrenOf.get(parentId) ?? [];
  if (siblings.length === 0) return 0;
  return Math.max(...siblings.map((node) => node.sortOrder)) + 1;
}

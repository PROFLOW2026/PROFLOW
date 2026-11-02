/**
 * Where a location's documentation lives in the customer's cloud (pure, client-safe).
 *
 * The LOGICAL structure (site > building > levels > units > rooms) is rich; the PHYSICAL structure is kept
 * deliberately small and is only created when something is uploaded:
 *
 *   תיעוד תשתיות / <site> / <building> / יחידות / <unit>     (one folder per unit, also a multi-level one)
 *                                     / שטחים משותפים / <lobby | parking | roof ...>
 *
 * - Levels never get a folder: level and room are stored as documentation metadata, and the level filter
 *   works from the location tree (see `levelScopeIds`).
 * - A room / space under a unit is stored in the unit's folder (no folder per room).
 * - A villa / private house (`structure: 'house'`) has no "units" grouping: everything lives in its folder.
 * - A tree without buildings (infrastructure / open areas) simply mirrors its areas.
 * - A location that already has its own folder mapping (older projects, linked folders) always wins; this
 *   module is only consulted for locations without one.
 */

/** lastError of a mapping whose cloud folder disappeared (needs the user's decision, never auto-replaced). */
export const FOLDER_MISSING = 'folder_missing';

export const UNITS_GROUP_NAME = 'יחידות';
export const COMMON_GROUP_NAME = 'שטחים משותפים';

export interface PlacementNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly code: string | null;
  readonly type?: string;
  readonly structure?: 'house' | 'building' | null;
  readonly archived?: boolean;
}

export type PlacementSegment =
  | { readonly kind: 'location'; readonly locationId: string }
  | { readonly kind: 'group'; readonly key: string; readonly name: string };

export interface Placement {
  /** Folder path below the infrastructure root, outermost first. The last location segment is the anchor. */
  readonly segments: readonly PlacementSegment[];
  /** The location whose folder holds the documentation of the requested location. */
  readonly anchorId: string;
}

const CONTAINER_TYPES = new Set(['site', 'building', 'wing']);
const FLOOR_TYPES = new Set(['floor', 'basement']);
const UNIT_TYPES = new Set(['apartment', 'unit']);

function chainOf(tree: readonly PlacementNode[], locationId: string): PlacementNode[] {
  const byId = new Map(tree.map((node) => [node.id, node]));
  const chain: PlacementNode[] = [];
  const seen = new Set<string>();
  let cursor = byId.get(locationId) ?? null;
  while (cursor && !seen.has(cursor.id) && chain.length < 40) {
    seen.add(cursor.id);
    chain.unshift(cursor);
    cursor = cursor.parentId ? (byId.get(cursor.parentId) ?? null) : null;
  }
  return chain;
}

/** Placement of a location, or null when it is not in the tree. */
export function placementOf(tree: readonly PlacementNode[], locationId: string): Placement | null {
  const chain = chainOf(tree, locationId);
  if (chain.length === 0) return null;

  const segments: PlacementSegment[] = [];
  let container: PlacementNode | null = null;
  let insideBuilding = false;
  let house = false;
  let anchorId = chain[0]!.id;

  const push = (node: PlacementNode) => {
    segments.push({ kind: 'location', locationId: node.id });
    anchorId = node.id;
  };
  const pushGroup = (key: 'units' | 'common') => {
    const last = segments[segments.length - 1];
    if (last && last.kind === 'group' && last.key.startsWith(`${key}:`)) return;
    segments.push({
      kind: 'group',
      key: `${key}:${container?.id ?? 'root'}`,
      name: key === 'units' ? UNITS_GROUP_NAME : COMMON_GROUP_NAME,
    });
  };

  for (const node of chain) {
    const type = node.type ?? 'other';

    if (CONTAINER_TYPES.has(type)) {
      push(node);
      container = node;
      if (type !== 'site') insideBuilding = true;
      if (type === 'building' && node.structure === 'house') house = true;
      continue;
    }
    if (FLOOR_TYPES.has(type)) {
      // A level is metadata, not a folder: its own documents sit in the building folder.
      if (!container) push(node);
      continue;
    }
    if (UNIT_TYPES.has(type)) {
      if (house) continue;
      if (insideBuilding) pushGroup('units');
      push(node);
      break; // everything below a unit (rooms, spaces) is filed in the unit's folder
    }
    // Spaces: rooms, areas, roofs, parking, facades, lobbies ...
    if (house) continue;
    if (insideBuilding) pushGroup('common');
    push(node);
  }

  if (segments.length === 0) push(chain[chain.length - 1]!);
  return { segments, anchorId };
}

/** Where a location's files go, for display ("יחידות / דירה 1" style path; names only). */
export function placementPath(tree: readonly PlacementNode[], locationId: string): string[] {
  const placement = placementOf(tree, locationId);
  if (!placement) return [];
  const byId = new Map(tree.map((node) => [node.id, node]));
  return placement.segments.map((segment) =>
    segment.kind === 'group' ? segment.name : (byId.get(segment.locationId)?.name ?? ''),
  );
}

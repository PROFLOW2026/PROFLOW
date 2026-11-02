import { subtreeIds, type LocationTreeNode } from './filters';

/**
 * Contractor location restriction (pure). A grant may be limited to specific units / locations; those locations and
 * everything below them are "allowed". Several grants of the same principal add up; any unrestricted grant wins.
 */

type NodeRef = Pick<LocationTreeNode, 'id' | 'parentId'> & Partial<LocationTreeNode>;

/** null = unrestricted; otherwise every allowed location id (the granted locations and all their descendants). */
export function allowedLocationSet(
  grants: readonly { readonly allowedLocationIds?: readonly string[] | null }[],
  nodes: readonly NodeRef[],
): Set<string> | null {
  if (grants.length === 0) return null;
  const tree = nodes.map((node) => ({ id: node.id, parentId: node.parentId, name: node.name ?? '', code: node.code ?? null }));
  const allowed = new Set<string>();
  for (const grant of grants) {
    const roots = grant.allowedLocationIds;
    if (!roots || roots.length === 0) return null;
    for (const root of roots) for (const id of subtreeIds(tree, root)) allowed.add(id);
  }
  return allowed;
}

/** The allowed locations plus their ancestors (names only, so the tree around an allowed unit stays navigable). */
export function visibleLocationSet(allowed: ReadonlySet<string>, nodes: readonly NodeRef[]): Set<string> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visible = new Set(allowed);
  for (const id of allowed) {
    let parentId = byId.get(id)?.parentId ?? null;
    while (parentId && !visible.has(parentId)) {
      visible.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }
  return visible;
}

const UNIT_LIKE = new Set(['apartment', 'unit']);

interface LevelChoiceNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly type: string;
  readonly archived: boolean;
  readonly extraLevelIds?: readonly string[];
}

/**
 * Levels offered when documenting at `locationId`. Only a multi-level unit (or a space inside one) has a choice:
 * its primary level (the parent) first, then its additional levels. Everything else returns [] (no selector).
 */
export function captureLevelChoices(
  nodes: readonly LevelChoiceNode[],
  locationId: string | null,
): { id: string; name: string }[] {
  if (!locationId) return [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let unit: LevelChoiceNode | undefined = byId.get(locationId);
  for (let depth = 0; unit && !UNIT_LIKE.has(unit.type) && depth < 40; depth += 1) {
    unit = unit.parentId ? byId.get(unit.parentId) : undefined;
  }
  if (!unit || !UNIT_LIKE.has(unit.type) || (unit.extraLevelIds ?? []).length === 0) return [];
  const ids = [unit.parentId, ...(unit.extraLevelIds ?? [])];
  const choices: { id: string; name: string }[] = [];
  for (const id of ids) {
    const level = id ? byId.get(id) : undefined;
    if (level && !level.archived && !choices.some((choice) => choice.id === level.id)) choices.push({ id: level.id, name: level.name });
  }
  return choices.length > 1 ? choices : [];
}

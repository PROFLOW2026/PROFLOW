import { INFRA_TYPES, INFRA_TYPE_LABELS, type InfraLocationOption, type InfraType } from './types';

/** Pure helpers behind gallery search / filters (client and server share them). */

export function escapeLikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export interface LocationTreeNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly code: string | null;
}

/** `id` and all its descendants. */
export function subtreeIds(nodes: readonly LocationTreeNode[], rootId: string): string[] {
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const list = children.get(node.parentId) ?? [];
    list.push(node.id);
    children.set(node.parentId, list);
  }
  const result: string[] = [];
  const stack = [rootId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);
    result.push(next);
    for (const child of children.get(next) ?? []) stack.push(child);
  }
  return result;
}

/** Locations whose name or code contains the typed text (so "קומה 3" finds photos of that floor). */
export function locationIdsMatchingText(nodes: readonly LocationTreeNode[], text: string): string[] {
  const needle = text.trim().toLocaleLowerCase();
  if (!needle) return [];
  const direct = nodes.filter(
    (node) => node.name.toLocaleLowerCase().includes(needle) || (node.code ?? '').toLocaleLowerCase().includes(needle),
  );
  const ids = new Set<string>();
  for (const node of direct) for (const id of subtreeIds(nodes, node.id)) ids.add(id);
  return [...ids];
}

/** Infra types whose Hebrew label (or code) contains the typed text. */
export function infraTypesMatchingText(text: string): InfraType[] {
  const needle = text.trim().toLocaleLowerCase();
  if (!needle) return [];
  return INFRA_TYPES.filter((type) => INFRA_TYPE_LABELS[type].includes(needle) || type.includes(needle));
}

/** Day bounds (inclusive start, exclusive end) in UTC for a yyyy-mm-dd filter. */
export function dayRange(from: string | null | undefined, to: string | null | undefined): { from: Date | null; toExclusive: Date | null } {
  const start = from ? new Date(`${from}T00:00:00.000Z`) : null;
  let end: Date | null = null;
  if (to) {
    end = new Date(`${to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
  }
  return {
    from: start && !Number.isNaN(start.getTime()) ? start : null,
    toExclusive: end && !Number.isNaN(end.getTime()) ? end : null,
  };
}

/** Opaque keyset cursor `<epochMs>_<uuid>`. */
export function encodeCursor(capturedAt: Date, id: string): string {
  return `${capturedAt.getTime()}_${id}`;
}

export function decodeCursor(raw: string | null | undefined): { capturedAt: Date; id: string } | null {
  if (!raw) return null;
  const match = /^(\d{1,15})_([0-9a-f-]{36})$/i.exec(raw);
  if (!match) return null;
  const date = new Date(Number(match[1]));
  return Number.isNaN(date.getTime()) ? null : { capturedAt: date, id: match[2]! };
}

/** Path label ("בניין א › קומה 3 › דירה 12") from a flat list. */
export function locationLabel(nodes: readonly InfraLocationOption[], id: string, separator = ' › '): string | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parts: string[] = [];
  const seen = new Set<string>();
  let cursor = byId.get(id) ?? null;
  while (cursor && !seen.has(cursor.id) && parts.length < 40) {
    seen.add(cursor.id);
    parts.unshift(cursor.name);
    cursor = cursor.parentId ? (byId.get(cursor.parentId) ?? null) : null;
  }
  return parts.length > 0 ? parts.join(separator) : null;
}

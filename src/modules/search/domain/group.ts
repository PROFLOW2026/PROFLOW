import type { GlobalSearchGroup, GlobalSearchHit, GlobalSearchKind } from './types';
import { GLOBAL_SEARCH_KINDS } from './types';

export function groupSearchHits(hits: readonly GlobalSearchHit[]): GlobalSearchGroup[] {
  const byKind = new Map<GlobalSearchKind, GlobalSearchHit[]>();
  for (const hit of hits) {
    const list = byKind.get(hit.kind) ?? [];
    list.push(hit);
    byKind.set(hit.kind, list);
  }
  return GLOBAL_SEARCH_KINDS.flatMap((kind) => {
    const groupHits = byKind.get(kind);
    if (!groupHits || groupHits.length === 0) return [];
    return [{ kind, hits: groupHits }];
  });
}

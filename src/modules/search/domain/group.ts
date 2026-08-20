import type { GlobalSearchGroup, GlobalSearchHit, GlobalSearchKind } from './types';
import { GLOBAL_SEARCH_KINDS } from './types';
import { orderedSearchKindsForPersona } from './persona-kind-order';
import type { ExperiencePersonaKey } from '@/modules/tenancy/domain/experience-persona';

export function groupSearchHits(
  hits: readonly GlobalSearchHit[],
  persona?: ExperiencePersonaKey | null,
): GlobalSearchGroup[] {
  const byKind = new Map<GlobalSearchKind, GlobalSearchHit[]>();
  for (const hit of hits) {
    const list = byKind.get(hit.kind) ?? [];
    list.push(hit);
    byKind.set(hit.kind, list);
  }
  const order = persona ? orderedSearchKindsForPersona(persona) : GLOBAL_SEARCH_KINDS;
  return order.flatMap((kind) => {
    const groupHits = byKind.get(kind);
    if (!groupHits || groupHits.length === 0) return [];
    return [{ kind, hits: groupHits }];
  });
}

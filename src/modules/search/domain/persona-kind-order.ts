/**
 * Soft search-group ordering by persona — permission/module gates stay authoritative.
 */

import type { ExperiencePersonaKey } from '@/modules/tenancy/domain/experience-persona';
import type { GlobalSearchKind } from './types';
import { GLOBAL_SEARCH_KINDS } from './types';

const PERSONA_KIND_PRIORITY: Readonly<
  Record<ExperiencePersonaKey, readonly GlobalSearchKind[]>
> = {
  project_contractor: [
    'project',
    'client',
    'vendor',
    'purchase_order',
    'boq_item',
    'billing',
    'expense',
    'quote',
  ],
  electrical: ['job', 'project', 'client', 'quote', 'expense', 'employee', 'purchase_order'],
  renovation: ['project', 'job', 'client', 'quote', 'expense', 'vendor'],
  small_works: ['job', 'client', 'quote', 'expense', 'billing'],
  service: ['work_order', 'client', 'employee', 'expense', 'billing', 'daily_log'],
  architecture: ['project', 'client', 'quote', 'document', 'billing'],
  consulting: ['project', 'client', 'quote', 'employee', 'billing', 'document'],
  inspection: ['inspection', 'safety', 'punch', 'daily_log', 'project', 'client'],
  mixed: ['project', 'job', 'work_order', 'client', 'quote', 'expense'],
  all: GLOBAL_SEARCH_KINDS,
};

export function orderedSearchKindsForPersona(
  persona: ExperiencePersonaKey | null | undefined,
): readonly GlobalSearchKind[] {
  if (!persona) return GLOBAL_SEARCH_KINDS;
  const preferred = PERSONA_KIND_PRIORITY[persona] ?? GLOBAL_SEARCH_KINDS;
  const seen = new Set<GlobalSearchKind>();
  const ordered: GlobalSearchKind[] = [];
  for (const kind of preferred) {
    if (seen.has(kind)) continue;
    seen.add(kind);
    ordered.push(kind);
  }
  for (const kind of GLOBAL_SEARCH_KINDS) {
    if (seen.has(kind)) continue;
    ordered.push(kind);
  }
  return ordered;
}

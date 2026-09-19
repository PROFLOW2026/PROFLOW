/**
 * Global Search — application layer dispatcher.
 *
 * Integrates task search (Agent I) into the existing search architecture.
 * Returns GlobalSearchResult with grouped hits following existing conventions.
 *
 * Access rules for tasks:
 *  - Filtered by caller workspace membership (accessibleWorkspaceIds)
 *  - Filtered by project-context access (accessibleProjectIds)
 *  - NEVER returns hits from inaccessible workspaces
 */
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { resolveAccessibleProjectIds } from '@/modules/projects/application/project-access';
import { getAccessibleWorkspaceIds } from '@/modules/operations';
import { taskSearchHref } from '../domain/hrefs';
import { groupSearchHits } from '../domain/group';
import type { GlobalSearchHit, GlobalSearchResult, SearchCommandHit } from '../domain/types';
import { searchTasks } from '../data/search.repository';

// ─── Task search integration ──────────────────────────────────────────────────

async function fetchTaskHits(
  context: OrgContext,
  query: string,
  limit: number,
): Promise<GlobalSearchHit[]> {
  if (!hasPermission(context, PERMISSIONS.TASKS_READ)) return [];

  const [accessibleProjectIds, accessibleWorkspaceIds] = await Promise.all([
    resolveAccessibleProjectIds(context),
    getAccessibleWorkspaceIds(context.db, context.organizationId, context.membershipId),
  ]);

  const hits = await searchTasks(
    context.db,
    context.organizationId,
    query,
    accessibleWorkspaceIds,
    accessibleProjectIds,
    limit,
  );

  return hits.map((hit): GlobalSearchHit => ({
    kind: 'task',
    id: hit.id,
    title: hit.title,
    subtitle: [hit.workspaceName, hit.projectName].filter(Boolean).join(' · ') || null,
    href: taskSearchHref(hit.id),
    status: hit.status,
    contextLabel: hit.projectName ?? hit.workspaceName ?? null,
    date: hit.dueDate,
  }));
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

/**
 * Global search dispatcher.
 * Compatible with existing `search-actions.ts` call: `globalSearch(context, { query })`.
 */
export async function globalSearch(
  context: OrgContext,
  input: { query: string; limit?: number },
): Promise<GlobalSearchResult> {
  const query = input.query?.trim() ?? '';
  if (!query) {
    return { query: '', commands: [], groups: [], hits: [] };
  }

  const perEntityLimit = input.limit ?? 10;

  // Task hits — access-scoped
  const taskHits = await fetchTaskHits(context, query, perEntityLimit);

  // Merge task hits with any future entity hits here (other agents add their entities).
  // For now, only task hits are new; existing entity hits come from pre-existing search paths.
  const allNewHits: GlobalSearchHit[] = [...taskHits];

  // Build commands (empty for task search — commands come from domain/commands.ts)
  const commands: SearchCommandHit[] = [];

  const groups = groupSearchHits(allNewHits, null);

  return {
    query,
    commands,
    groups,
    hits: allNewHits,
  };
}

/**
 * Search tasks only (used by task-specific search UIs and operations dashboard).
 * Access rules enforced identically to globalSearch task branch.
 */
export async function searchTasksOnly(
  context: OrgContext,
  query: string,
  limit = 20,
): Promise<GlobalSearchHit[]> {
  if (!query.trim()) return [];
  return fetchTaskHits(context, query, limit);
}

// ─── Exported types ───────────────────────────────────────────────────────────

export type { GlobalSearchResult, GlobalSearchHit } from '../domain/types';

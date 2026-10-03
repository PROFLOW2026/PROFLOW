import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { projectMemberCapabilities, projectMembers, projects } from '@drizzle/schema';
import { isOrgProjectAdmin } from '@/modules/project-team/application/capability-guard';
import type { ProjectCapability } from '@/modules/project-team/domain/capabilities';
import type { OrgContext } from '@/shared/auth/context';
import { buildDgItems, DG_ITEM_DEFINITIONS, type DgItemDefinition } from '../domain/dg-items';
import { DG_SOURCE_TYPES, type CommandCenterItem } from '../domain/types';
import type { CollectContext } from './collect-sources';
import { dgCommandCenterPortsFor, type DgCommandCenterQuery } from './dg-ports';

import '@/modules/subcontract-claims/register-ports';
import '@/modules/coordination/register-ports';
import '@/modules/collaboration/register-ports';
import '@/modules/defects/register-ports';
import '@/modules/rfi/register-ports';
import '@/modules/submittals/register-ports';
import '@/modules/contractor-compliance/register-ports';
import '@/modules/site-instructions/register-ports';
import '@/modules/project-plans/register-ports';

const DG_PER_SOURCE_CAP = 15;
const DG_PROJECT_SCOPE_CAP = 200;

/** `all` = org-wide project admin; otherwise project -> held capabilities (stored pre-expanded). */
export type ViewerProjectCapabilities = 'all' | ReadonlyMap<string, ReadonlySet<string>>;

export async function loadViewerProjectCapabilities(context: OrgContext): Promise<ViewerProjectCapabilities> {
  if (isOrgProjectAdmin(context)) return 'all';
  const rows = await context.db
    .select({ projectId: projectMembers.projectId, capability: projectMemberCapabilities.capability })
    .from(projectMembers)
    .innerJoin(
      projectMemberCapabilities,
      and(
        eq(projectMemberCapabilities.memberId, projectMembers.id),
        eq(projectMemberCapabilities.organizationId, projectMembers.organizationId),
      ),
    )
    .where(
      and(
        eq(projectMembers.organizationId, context.organizationId),
        eq(projectMembers.userId, context.userId),
        eq(projectMembers.status, 'active'),
      ),
    );
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const bucket = map.get(row.projectId);
    if (bucket) bucket.add(row.capability);
    else map.set(row.projectId, new Set([row.capability]));
  }
  return map;
}

/** Projects where the viewer holds any of `capabilities`; `all` for org-wide admins. */
export function projectsWithCapability(
  viewer: ViewerProjectCapabilities,
  capabilities: readonly ProjectCapability[],
): 'all' | string[] {
  if (viewer === 'all') return 'all';
  const result: string[] = [];
  for (const [projectId, held] of viewer) {
    if (capabilities.some((capability) => held.has(capability))) result.push(projectId);
  }
  return result.slice(0, DG_PROJECT_SCOPE_CAP);
}

async function withSavepoint<T>(context: OrgContext, run: () => Promise<T>, fallback: T): Promise<T> {
  const savepoint = `cc_dg_${randomUUID().replace(/-/g, '')}`;
  try {
    await context.db.execute(sql.raw(`savepoint "${savepoint}"`));
    const result = await run();
    await context.db.execute(sql.raw(`release savepoint "${savepoint}"`));
    return result;
  } catch {
    try {
      await context.db.execute(sql.raw(`rollback to savepoint "${savepoint}"`));
    } catch {
      // the savepoint may not exist if the failure happened before it was created
    }
    return fallback;
  }
}

async function listActiveProjectIds(context: OrgContext): Promise<string[]> {
  const rows = await context.db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.organizationId, context.organizationId), eq(projects.status, 'active')))
    .orderBy(desc(projects.updatedAt))
    .limit(DG_PROJECT_SCOPE_CAP);
  return rows.map((row) => row.id);
}

async function collectDefinition(
  ctx: CollectContext,
  viewer: ViewerProjectCapabilities,
  definition: DgItemDefinition,
  ports: readonly DgCommandCenterQuery[],
  adminProjectIds: () => Promise<string[]>,
): Promise<CommandCenterItem[]> {
  const scoped = projectsWithCapability(viewer, definition.capabilities);
  const projectIds = scoped === 'all' ? await adminProjectIds() : scoped;
  if (projectIds.length === 0) return [];
  const allowed = new Set(projectIds);

  const rows = [];
  for (const port of ports) {
    const result = await withSavepoint(
      ctx.context,
      () => port(ctx.context, { projectIds, today: ctx.today, limit: DG_PER_SOURCE_CAP }),
      [] as Awaited<ReturnType<DgCommandCenterQuery>>,
    );
    rows.push(...result.filter((row) => allowed.has(row.projectId)));
  }
  return buildDgItems({ definition, rows, scope: ctx.copyScope, today: ctx.today, cap: DG_PER_SOURCE_CAP });
}

/**
 * Developer / GC sources. Sequential (savepoint isolation on the shared transaction); sources with
 * no registered port cost nothing, and a viewer without the capability on any project gets nothing.
 */
export async function collectDgSources(ctx: CollectContext): Promise<CommandCenterItem[]> {
  const active = DG_SOURCE_TYPES.map((sourceType) => ({
    definition: DG_ITEM_DEFINITIONS[sourceType],
    ports: dgCommandCenterPortsFor(sourceType),
  })).filter((entry) => entry.ports.length > 0);
  if (active.length === 0) return [];

  const viewer = await withSavepoint(
    ctx.context,
    () => loadViewerProjectCapabilities(ctx.context),
    new Map() as ViewerProjectCapabilities,
  );
  let adminProjects: Promise<string[]> | null = null;
  const adminProjectIds = () => {
    adminProjects ??= withSavepoint(ctx.context, () => listActiveProjectIds(ctx.context), [] as string[]);
    return adminProjects;
  };

  const items: CommandCenterItem[] = [];
  for (const entry of active) {
    items.push(...(await collectDefinition(ctx, viewer, entry.definition, entry.ports, adminProjectIds)));
  }
  return items;
}

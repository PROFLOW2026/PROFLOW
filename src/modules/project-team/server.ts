import 'server-only';

import { notFound } from 'next/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { findProjectSummary } from './data/project-team.repository';
import type { ProjectCapability } from './domain/capabilities';
import { loadProjectCapabilities } from './application/capability-guard';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProjectCapabilityPageAccess {
  readonly projectId: string;
  readonly projectName: string;
  readonly capabilities: ReadonlySet<ProjectCapability>;
  readonly has: (capability: ProjectCapability) => boolean;
}

export interface RequireProjectCapabilityOptions {
  /** `all` (default): every listed capability is required. `any`: one is enough. */
  readonly mode?: 'all' | 'any';
}

/**
 * RSC guard for internal Developer / GC pages (Owner app and Employee App shells).
 *
 * Missing project, foreign organization, or missing capability all render
 * `notFound()` - the same "no existence oracle" semantics as the rest of the
 * project routes. Use the returned `has()` to decide which sections to render
 * (e.g. financial panels) instead of loading data and hiding it in React.
 */
export async function requireProjectCapabilityPage(
  projectId: string,
  required: ProjectCapability | readonly ProjectCapability[],
  options: RequireProjectCapabilityOptions = {},
): Promise<ProjectCapabilityPageAccess> {
  if (!UUID_PATTERN.test(projectId)) notFound();
  const wanted: readonly ProjectCapability[] = typeof required === 'string' ? [required] : required;

  const access = await withOrgContext(async (context) => {
    const project = await findProjectSummary(context.db, context.organizationId, projectId);
    if (!project) return null;
    const capabilities = await loadProjectCapabilities(context, projectId);
    return { projectName: project.name, capabilities };
  });
  if (!access) notFound();

  const allowed =
    wanted.length === 0
      ? access.capabilities.size > 0
      : options.mode === 'any'
        ? wanted.some((capability) => access.capabilities.has(capability))
        : wanted.every((capability) => access.capabilities.has(capability));
  if (!allowed) notFound();

  return {
    projectId,
    projectName: access.projectName,
    capabilities: access.capabilities,
    has: (capability) => access.capabilities.has(capability),
  };
}

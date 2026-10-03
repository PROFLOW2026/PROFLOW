import { EXTERNAL_CAPABILITIES, type ExternalGrantView } from '@/shared/external';

/**
 * One (grant -> project) edge returned by the external portal directory. A vendor-wide grant
 * (`projectId = null`) yields one row per project the vendor has an agreement on.
 */
export interface PortalDirectoryRow {
  readonly grantId: string;
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly vendorId: string;
  readonly vendorName: string | null;
  readonly projectId: string;
  readonly projectName: string | null;
  readonly projectNumber: string | null;
}

export interface PortalVendorRef {
  readonly vendorId: string;
  readonly vendorName: string | null;
}

export interface PortalProjectAccess {
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly projectId: string;
  readonly projectName: string | null;
  readonly projectNumber: string | null;
  readonly vendors: readonly PortalVendorRef[];
  readonly grantIds: readonly string[];
  /** Union of capabilities of the grants that reach this project. */
  readonly capabilities: ReadonlySet<string>;
}

function grantUsable(grant: ExternalGrantView, now: Date): boolean {
  if (grant.expiresAt && grant.expiresAt.getTime() <= now.getTime()) return false;
  return grant.capabilities.has(EXTERNAL_CAPABILITIES.PROJECT_VIEW);
}

/**
 * Projects the principal may open in the portal. Capabilities always come from the session's own
 * grants; the directory only says which project a vendor-wide grant reaches (and supplies names).
 * Rows that do not match a usable session grant are dropped.
 */
export function resolvePortalProjects(
  grants: readonly ExternalGrantView[],
  directory: readonly PortalDirectoryRow[],
  now: Date = new Date(),
): readonly PortalProjectAccess[] {
  const usable = new Map(grants.filter((grant) => grantUsable(grant, now)).map((grant) => [grant.grantId, grant]));

  const edges: PortalDirectoryRow[] = [];
  for (const row of directory) {
    const grant = usable.get(row.grantId);
    if (!grant) continue;
    if (grant.organizationId !== row.organizationId || grant.vendorId !== row.vendorId) continue;
    if (grant.projectId && grant.projectId !== row.projectId) continue;
    edges.push(row);
  }

  for (const grant of usable.values()) {
    if (!grant.projectId) continue;
    const covered = edges.some((edge) => edge.grantId === grant.grantId && edge.projectId === grant.projectId);
    if (covered) continue;
    edges.push({
      grantId: grant.grantId,
      organizationId: grant.organizationId,
      organizationName: null,
      vendorId: grant.vendorId,
      vendorName: null,
      projectId: grant.projectId,
      projectName: null,
      projectNumber: null,
    });
  }

  interface Accumulator {
    organizationId: string;
    organizationName: string | null;
    projectId: string;
    projectName: string | null;
    projectNumber: string | null;
    vendors: Map<string, string | null>;
    grantIds: Set<string>;
    capabilities: Set<string>;
  }

  const byProject = new Map<string, Accumulator>();
  for (const edge of edges) {
    const key = `${edge.organizationId}:${edge.projectId}`;
    let entry = byProject.get(key);
    if (!entry) {
      entry = {
        organizationId: edge.organizationId,
        organizationName: edge.organizationName,
        projectId: edge.projectId,
        projectName: edge.projectName,
        projectNumber: edge.projectNumber,
        vendors: new Map(),
        grantIds: new Set(),
        capabilities: new Set(),
      };
      byProject.set(key, entry);
    }
    entry.organizationName ??= edge.organizationName;
    entry.projectName ??= edge.projectName;
    entry.projectNumber ??= edge.projectNumber;
    entry.vendors.set(edge.vendorId, entry.vendors.get(edge.vendorId) ?? edge.vendorName);
    entry.grantIds.add(edge.grantId);
    for (const capability of usable.get(edge.grantId)!.capabilities) entry.capabilities.add(capability);
  }

  return [...byProject.values()]
    .map((entry) => ({
      organizationId: entry.organizationId,
      organizationName: entry.organizationName,
      projectId: entry.projectId,
      projectName: entry.projectName,
      projectNumber: entry.projectNumber,
      vendors: [...entry.vendors].map(([vendorId, vendorName]) => ({ vendorId, vendorName })),
      grantIds: [...entry.grantIds],
      capabilities: entry.capabilities as ReadonlySet<string>,
    }))
    .sort(
      (a, b) =>
        (a.organizationName ?? a.organizationId).localeCompare(b.organizationName ?? b.organizationId) ||
        (a.projectName ?? a.projectId).localeCompare(b.projectName ?? b.projectId),
    );
}

export function findPortalProject(
  projects: readonly PortalProjectAccess[],
  projectId: string,
): PortalProjectAccess | null {
  return projects.find((project) => project.projectId === projectId) ?? null;
}

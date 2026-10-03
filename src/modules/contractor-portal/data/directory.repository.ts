import { sql } from 'drizzle-orm';
import { listExternalDirectory } from '@/modules/contractor-access';
import type { ExternalContext } from '@/shared/external';
import type { PortalDirectoryRow } from '../domain/project-access';
import { isolatedRead } from './isolate';

function sqlResultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

/**
 * Grant -> project edges with display names for the current external principal, from Track C's
 * `listExternalDirectory` (SECURITY DEFINER `app.external_portal_directory()`; external principals
 * cannot SELECT projects / vendors / organizations under RLS). Until that function is deployed the
 * portal falls back to explicit grant projects without names.
 */
export async function loadPortalDirectoryRows(context: ExternalContext): Promise<readonly PortalDirectoryRow[]> {
  const probe = sqlResultRows<{ present: boolean }>(
    await context.db.execute(sql`select to_regprocedure('app.external_portal_directory()') is not null as present`),
  );
  if (!probe[0]?.present) return [];

  try {
    const entries = await isolatedRead(context.db, (db) => listExternalDirectory({ ...context, db }));
    return entries.flatMap((entry) =>
      entry.projectId
        ? [
            {
              grantId: entry.grantId,
              organizationId: entry.organizationId,
              organizationName: entry.organizationName,
              vendorId: entry.vendorId,
              vendorName: entry.vendorName,
              projectId: entry.projectId,
              projectName: entry.projectName,
              projectNumber: null,
            },
          ]
        : [],
    );
  } catch (error) {
    console.error('[contractor-portal] external portal directory failed', error);
    return [];
  }
}

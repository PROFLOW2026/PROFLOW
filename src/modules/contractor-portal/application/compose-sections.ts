import type { ExternalContext } from '@/shared/external';
import { isolatedRead } from '../data/isolate';
import type { PortalProjectAccess } from '../domain/project-access';
import {
  mergeSectionResults,
  planPortalSections,
  PORTAL_SECTION_ITEM_LIMIT,
  type ComposedPortalSection,
  type PortalSectionProvider,
  type PortalSectionSummary,
} from '../domain/sections';
import { PORTAL_SECTION_PROVIDERS } from './registry';

/**
 * Loads every section the principal may see across `projects` (dashboard: all projects; project
 * home: one). Providers run sequentially on the principal's single RLS-bound executor, each
 * isolated so one failing domain never blanks the page.
 */
export async function composePortalSections(
  context: ExternalContext,
  projects: readonly PortalProjectAccess[],
  options: {
    readonly providers?: readonly PortalSectionProvider[];
    readonly now?: Date;
    readonly limit?: number;
  } = {},
): Promise<readonly ComposedPortalSection[]> {
  const providers = options.providers ?? PORTAL_SECTION_PROVIDERS;
  const now = options.now ?? new Date();
  const limit = options.limit ?? PORTAL_SECTION_ITEM_LIMIT;

  const composed: ComposedPortalSection[] = [];
  for (const plan of planPortalSections(projects, providers)) {
    const results: (PortalSectionSummary | null)[] = [];
    for (const { provider, targets } of plan.providers) {
      try {
        results.push(
          await isolatedRead(context.db, (db) =>
            provider.load({ ...context, db }, { targets, now, limit }),
          ),
        );
      } catch (error) {
        console.error(`[contractor-portal] provider ${provider.id} failed`, error);
        results.push(null);
      }
    }
    composed.push(mergeSectionResults(plan.section, results, limit));
  }
  return composed;
}

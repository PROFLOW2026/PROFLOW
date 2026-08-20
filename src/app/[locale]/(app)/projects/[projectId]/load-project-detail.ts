import { cache } from 'react';
import {
  assembleProjectDetail,
  countProjectActiveWorkPackages,
  getProjectDetailChrome,
  getProjectDetailStructure,
  type ProjectDetail,
} from '@/modules/projects';
import { getBusinessProfileKeyForOrg } from '@/modules/tenancy';
import { withOrgContext } from '@/shared/auth/session';

/**
 * Request-scoped project detail for layout, page, and metadata.
 *
 * Layout (chrome) and page (overview structure) share one chrome fetch via
 * nested `cache` - previously `includeStructure` was part of a single cache
 * key and layout+page each paid for project/contract/events twice.
 */
const loadProjectChrome = cache(async (projectId: string) =>
  withOrgContext((context) => getProjectDetailChrome(context, projectId)),
);

const loadProjectStructure = cache(async (projectId: string) =>
  withOrgContext((context) => getProjectDetailStructure(context, projectId)),
);

const loadActiveWorkPackageCount = cache(async (projectId: string) =>
  withOrgContext((context) => countProjectActiveWorkPackages(context, projectId)),
);

/** Shared with layout + page so profile-aware tabs do not double-hit settings. */
export const loadOrgBusinessProfileKey = cache(async () =>
  withOrgContext((context) =>
    getBusinessProfileKeyForOrg(context.db, context.organizationId),
  ).catch(() => null),
);

export const loadProjectDetail = cache(
  async (projectId: string, includeStructure: boolean): Promise<ProjectDetail> => {
    // Chrome is shared with layout; structure/count run in parallel with it
    // so overview does not pay chrome-then-structure sequential txs.
    if (includeStructure) {
      const [chrome, structure] = await Promise.all([
        loadProjectChrome(projectId),
        loadProjectStructure(projectId),
      ]);
      return assembleProjectDetail(chrome, structure);
    }

    const [chrome, activeCount] = await Promise.all([
      loadProjectChrome(projectId),
      loadActiveWorkPackageCount(projectId),
    ]);
    return assembleProjectDetail(chrome, {
      workPackages: [],
      phases: [],
      milestones: [],
      activeCount,
    });
  },
);

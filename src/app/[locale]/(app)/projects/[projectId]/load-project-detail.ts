import { cache } from 'react';
import {
  assembleProjectDetail,
  countProjectActiveWorkPackages,
  getProjectDetailChrome,
  getProjectDetailStructure,
  type ProjectDetail,
} from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';

/**
 * Request-scoped project detail for layout, page, and metadata.
 *
 * Layout (chrome) and page (overview structure) share one chrome fetch via
 * nested `cache` — previously `includeStructure` was part of a single cache
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

export const loadProjectDetail = cache(
  async (projectId: string, includeStructure: boolean): Promise<ProjectDetail> => {
    const chrome = await loadProjectChrome(projectId);

    if (includeStructure) {
      const structure = await loadProjectStructure(projectId);
      return assembleProjectDetail(chrome, structure);
    }

    const activeCount = await loadActiveWorkPackageCount(projectId);
    return assembleProjectDetail(chrome, {
      workPackages: [],
      phases: [],
      milestones: [],
      activeCount,
    });
  },
);

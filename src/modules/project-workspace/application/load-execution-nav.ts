import 'server-only';

import { findProjectDeliveryProfile } from '@/modules/project-profile/application/structure';
import { loadProjectCapabilities } from '@/modules/project-team/application/capability-guard';
import type { OrgContext } from '@/shared/auth/context';
import { selectExecutionHubs, type ExecutionHubLink } from '../domain/execution-hubs';
import { shouldShowExecutionNavGroup } from '../domain/select-execution-nav-links';

export interface ProjectExecutionNavView {
  readonly showGroup: boolean;
  readonly links: readonly ExecutionHubLink[];
}

export async function loadProjectExecutionNav(
  context: OrgContext,
  projectId: string,
  options?: { readonly surfaceRoot?: string },
): Promise<ProjectExecutionNavView> {
  const [capabilities, deliveryProfile] = await Promise.all([
    loadProjectCapabilities(context, projectId),
    findProjectDeliveryProfile(context, projectId),
  ]);

  const showGroup = shouldShowExecutionNavGroup({
    deliveryProfile,
    hasSubcontractAgreements: false,
  });
  if (!showGroup) {
    return { showGroup: false, links: [] };
  }

  const links = selectExecutionHubs({
    projectId,
    capabilities,
    deliveryProfile,
    surfaceRoot: options?.surfaceRoot,
  });

  return { showGroup: links.length > 0, links };
}

import 'server-only';

import { findProjectDeliveryProfile } from '@/modules/project-profile/application/read-delivery-profile';
import { loadProjectCapabilities } from '@/modules/project-team/application/capability-guard';
import { getModuleVisibility } from '@/modules/tenancy/application/read-module-visibility';
import type { OrgContext } from '@/shared/auth/context';
import {
  selectProjectOperationalToolLinks,
  type ProjectOperationalToolLink,
} from '../domain/project-operational-tool-links';

export async function loadProjectOperationalToolLinks(
  context: OrgContext,
  projectId: string,
  options?: { readonly surfaceRoot?: string },
): Promise<readonly ProjectOperationalToolLink[]> {
  const [capabilities, deliveryProfile, modules] = await Promise.all([
    loadProjectCapabilities(context, projectId),
    findProjectDeliveryProfile(context, projectId),
    getModuleVisibility(context),
  ]);

  return selectProjectOperationalToolLinks({
    projectId,
    capabilities,
    deliveryProfile,
    modules: { field_ops: modules.field_ops },
    surfaceRoot: options?.surfaceRoot,
  });
}

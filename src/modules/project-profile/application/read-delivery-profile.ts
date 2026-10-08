import 'server-only';

import { loadProjectCapabilities } from '@/modules/project-team/application/capability-guard';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import type { OrgContext } from '@/shared/auth/context';
import { findDeliveryProfile } from '../data/profile.repository';
import type { DeliveryProfile } from '../domain/profile';

/**
 * Cheap profile read for navigation. Same view gate as structure permissions:
 * no `project.view` means the caller sees no delivery profile.
 */
export async function findProjectDeliveryProfile(
  context: OrgContext,
  projectId: string,
): Promise<DeliveryProfile | null> {
  const held = await loadProjectCapabilities(context, projectId);
  if (!held.has(PROJECT_CAPABILITIES.PROJECT_VIEW)) return null;
  return findDeliveryProfile(context.db, context.organizationId, projectId);
}

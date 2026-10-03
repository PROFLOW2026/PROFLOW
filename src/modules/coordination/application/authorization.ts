import {
  PROJECT_CAPABILITIES,
  assertAnyProjectCapability,
  loadProjectCapabilities,
  type ProjectCapability,
} from '@/modules/project-team';
import type { OrgContext } from '@/shared/auth/context';

/** Read: schedule.view or contractor.coordinate. Write / override: schedule.manage or contractor.coordinate. */
export const COORDINATION_READ_CAPABILITIES: readonly ProjectCapability[] = [
  PROJECT_CAPABILITIES.SCHEDULE_VIEW,
  PROJECT_CAPABILITIES.CONTRACTOR_COORDINATE,
];

export const COORDINATION_MANAGE_CAPABILITIES: readonly ProjectCapability[] = [
  PROJECT_CAPABILITIES.SCHEDULE_MANAGE,
  PROJECT_CAPABILITIES.CONTRACTOR_COORDINATE,
];

export function canManageWith(held: ReadonlySet<ProjectCapability>): boolean {
  return COORDINATION_MANAGE_CAPABILITIES.some((capability) => held.has(capability));
}

export function canReadWith(held: ReadonlySet<ProjectCapability>): boolean {
  return COORDINATION_READ_CAPABILITIES.some((capability) => held.has(capability));
}

export async function assertCanReadCoordination(
  context: OrgContext,
  projectId: string,
): Promise<ReadonlySet<ProjectCapability>> {
  return assertAnyProjectCapability(context, projectId, COORDINATION_READ_CAPABILITIES);
}

export async function assertCanManageCoordination(
  context: OrgContext,
  projectId: string,
): Promise<ReadonlySet<ProjectCapability>> {
  return assertAnyProjectCapability(context, projectId, COORDINATION_MANAGE_CAPABILITIES);
}

export async function coordinationAccess(
  context: OrgContext,
  projectId: string,
): Promise<{ canRead: boolean; canManage: boolean }> {
  const held = await loadProjectCapabilities(context, projectId);
  return { canRead: canReadWith(held), canManage: canManageWith(held) };
}

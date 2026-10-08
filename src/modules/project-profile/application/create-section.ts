import { isOrgProjectAdmin } from '@/modules/project-team/application/capability-guard';
import type { OrgContext } from '@/shared/auth/context';
import type { DeliveryCreateInput } from '../domain/create-section';
import { isManagementMode, operatingRolesForMode } from '../domain/management-mode';
import { updateConstructionCharacteristics, updateDeliveryProfile } from './profile';

/** The section is offered to org-wide project admins (they hold every capability on a new project). */
export function canSetDeliveryProfileAtCreate(context: OrgContext): boolean {
  return isOrgProjectAdmin(context);
}

/**
 * Applies the optional section right after `createProject`, inside the same transaction.
 * Runs the normal capability-checked use-cases (no bypass).
 */
export async function applyDeliveryAtProjectCreate(
  context: OrgContext,
  projectId: string,
  input: DeliveryCreateInput | null,
): Promise<{ applied: boolean }> {
  if (!input) return { applied: false };
  if (input.operatingRoles.length > 0) {
    await updateDeliveryProfile(context, {
      projectId,
      operatingRoles: input.operatingRoles,
      ownershipModel: input.ownershipModel,
    });
  }
  if (input.category !== null || Object.keys(input.counts).length > 0) {
    await updateConstructionCharacteristics(context, {
      projectId,
      category: input.category,
      constructionMethod: null,
      buildingsCount: input.counts.buildingsCount ?? null,
      floorsAboveGround: input.counts.floorsAboveGround ?? null,
      floorsBelowGround: input.counts.floorsBelowGround ?? null,
      residentialUnits: input.counts.residentialUnits ?? null,
      commercialUnits: input.counts.commercialUnits ?? null,
      parkingLevels: input.counts.parkingLevels ?? null,
      hasPublicAreas: false,
      builtAreaSqm: null,
      commercialAreaSqm: null,
      commonAreaSqm: null,
      siteAreaSqm: null,
      customMetadata: [],
    });
  }
  return { applied: true };
}

/**
 * Single-choice project type from create forms. Standard is the default and writes nothing.
 * Does not create a project_members row for the Owner.
 */
export async function applyManagementModeAtCreate(
  context: OrgContext,
  projectId: string,
  rawMode: unknown,
): Promise<void> {
  if (!isManagementMode(rawMode) || rawMode === 'standard_project') return;
  if (!canSetDeliveryProfileAtCreate(context)) return;
  await updateDeliveryProfile(context, {
    projectId,
    operatingRoles: operatingRolesForMode(rawMode),
    ownershipModel: rawMode === 'developer_gc' ? 'own_development' : 'client_project',
  });
}

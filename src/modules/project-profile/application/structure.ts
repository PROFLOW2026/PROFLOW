import { AuthorizationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { EMPTY_CHARACTERISTICS, type ConstructionCharacteristics } from '../domain/characteristics';
import type { LocationNode } from '../domain/locations';
import { STANDARD_PROFILE, clientRequirement, type ClientRequirement, type DeliveryProfile } from '../domain/profile';
import { findCharacteristics, findDeliveryProfile } from '../data/profile.repository';
import { listLocationTree } from './locations';
import { listProjectRecommendations, type ProjectRecommendationState } from './recommendations';
import { CAP, loadStructurePermissions, requireProjectWith, type StructurePermissions } from './authorize';

export interface ProjectStructureView {
  readonly project: { readonly id: string; readonly name: string; readonly hasClient: boolean };
  readonly permissions: StructurePermissions;
  readonly profile: DeliveryProfile;
  readonly profileSaved: boolean;
  readonly clientRequirement: ClientRequirement;
  readonly characteristics: ConstructionCharacteristics;
  readonly locations: readonly LocationNode[];
  readonly recommendations: ProjectRecommendationState;
}

/** Everything the `structure` page renders. Requires `project.view`. No money is read. */
export async function getProjectStructure(context: OrgContext, projectId: string): Promise<ProjectStructureView> {
  const permissions = await loadStructurePermissions(context, projectId);
  if (!permissions.canView) throw new AuthorizationError(`project:${CAP.VIEW}`);
  const project = await requireProjectWith(context, projectId, CAP.VIEW);

  const stored = await findDeliveryProfile(context.db, context.organizationId, projectId);
  const profile = stored ?? STANDARD_PROFILE;
  const characteristics = (await findCharacteristics(context.db, context.organizationId, projectId)) ?? EMPTY_CHARACTERISTICS;
  const locations = await listLocationTree(context, projectId);
  const recommendations = await listProjectRecommendations(context, projectId);

  return {
    project: { id: project.id, name: project.name, hasClient: project.clientId !== null },
    permissions,
    profile: {
      operatingRoles: [...profile.operatingRoles],
      ownershipModel: profile.ownershipModel,
      developerEntityName: profile.developerEntityName,
      notes: profile.notes,
    },
    profileSaved: stored !== null,
    clientRequirement: clientRequirement(profile),
    characteristics: {
      category: characteristics.category,
      constructionMethod: characteristics.constructionMethod,
      buildingsCount: characteristics.buildingsCount,
      floorsAboveGround: characteristics.floorsAboveGround,
      floorsBelowGround: characteristics.floorsBelowGround,
      residentialUnits: characteristics.residentialUnits,
      commercialUnits: characteristics.commercialUnits,
      parkingLevels: characteristics.parkingLevels,
      hasPublicAreas: characteristics.hasPublicAreas,
      builtAreaSqm: characteristics.builtAreaSqm,
      commercialAreaSqm: characteristics.commercialAreaSqm,
      commonAreaSqm: characteristics.commonAreaSqm,
      siteAreaSqm: characteristics.siteAreaSqm,
      customMetadata: { ...characteristics.customMetadata },
    },
    locations,
    recommendations,
  };
}

export { findProjectDeliveryProfile } from './read-delivery-profile';

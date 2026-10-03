import { internalActor } from '@/shared/actor';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import {
  EMPTY_CHARACTERISTICS,
  normalizeCustomMetadata,
  type ConstructionCharacteristics,
} from '../domain/characteristics';
import { STANDARD_PROFILE, buildDeliveryProfile, clientRequirement, type DeliveryProfile } from '../domain/profile';
import {
  findCharacteristics,
  findDeliveryProfile,
  upsertCharacteristics,
  upsertDeliveryProfile,
} from '../data/profile.repository';
import {
  updateCharacteristicsSchema,
  updateDeliveryProfileSchema,
  type UpdateCharacteristicsInput,
  type UpdateDeliveryProfileInput,
} from '../validation/schemas';
import { CAP, parseInput, requireProjectWith } from './authorize';

export async function getDeliveryProfile(context: OrgContext, projectId: string): Promise<DeliveryProfile> {
  await requireProjectWith(context, projectId, CAP.VIEW);
  return (await findDeliveryProfile(context.db, context.organizationId, projectId)) ?? STANDARD_PROFILE;
}

export async function getConstructionCharacteristics(
  context: OrgContext,
  projectId: string,
): Promise<ConstructionCharacteristics> {
  await requireProjectWith(context, projectId, CAP.VIEW);
  return (await findCharacteristics(context.db, context.organizationId, projectId)) ?? EMPTY_CHARACTERISTICS;
}

/** Requires `project_settings.manage`. Removing every role returns the project to "standard". */
export async function updateDeliveryProfile(
  context: OrgContext,
  rawInput: UpdateDeliveryProfileInput,
): Promise<DeliveryProfile> {
  const input = parseInput(updateDeliveryProfileSchema, rawInput);
  await requireProjectWith(context, input.projectId, CAP.SETTINGS);

  const before = await findDeliveryProfile(context.db, context.organizationId, input.projectId);
  const profile = buildDeliveryProfile(input);
  await upsertDeliveryProfile(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    userId: context.userId,
    profile,
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_DELIVERY_PROFILE_UPDATED,
    entityType: 'project',
    entityId: input.projectId,
    before: before
      ? { operatingRoles: before.operatingRoles, ownershipModel: before.ownershipModel }
      : null,
    after: { operatingRoles: profile.operatingRoles, ownershipModel: profile.ownershipModel },
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.PROFILE_DELIVERY_PROFILE_UPDATED,
    entityType: 'project',
    entityId: input.projectId,
    actor: internalActor(context.userId),
    payload: {
      operatingRoles: profile.operatingRoles,
      ownershipModel: profile.ownershipModel,
      clientRequirement: clientRequirement(profile),
    },
  });
  return profile;
}

/** Requires `project.manage`. Every field optional; empty strings clear values. */
export async function updateConstructionCharacteristics(
  context: OrgContext,
  rawInput: UpdateCharacteristicsInput,
): Promise<ConstructionCharacteristics> {
  const input = parseInput(updateCharacteristicsSchema, rawInput);
  await requireProjectWith(context, input.projectId, CAP.MANAGE);

  const before = await findCharacteristics(context.db, context.organizationId, input.projectId);
  const characteristics: ConstructionCharacteristics = {
    category: input.category,
    constructionMethod: input.constructionMethod,
    buildingsCount: input.buildingsCount,
    floorsAboveGround: input.floorsAboveGround,
    floorsBelowGround: input.floorsBelowGround,
    residentialUnits: input.residentialUnits,
    commercialUnits: input.commercialUnits,
    parkingLevels: input.parkingLevels,
    hasPublicAreas: input.hasPublicAreas,
    builtAreaSqm: input.builtAreaSqm,
    commercialAreaSqm: input.commercialAreaSqm,
    commonAreaSqm: input.commonAreaSqm,
    siteAreaSqm: input.siteAreaSqm,
    customMetadata: normalizeCustomMetadata(input.customMetadata),
  };
  await upsertCharacteristics(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    userId: context.userId,
    characteristics,
  });

  const { customMetadata: _beforeMetadata, ...beforeSnapshot } = before ?? EMPTY_CHARACTERISTICS;
  const { customMetadata, ...afterSnapshot } = characteristics;
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_CHARACTERISTICS_UPDATED,
    entityType: 'project',
    entityId: input.projectId,
    before: before ? beforeSnapshot : null,
    after: { ...afterSnapshot, customMetadataKeys: Object.keys(customMetadata) },
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.PROFILE_CHARACTERISTICS_UPDATED,
    entityType: 'project',
    entityId: input.projectId,
    actor: internalActor(context.userId),
    payload: {
      category: characteristics.category,
      buildingsCount: characteristics.buildingsCount,
      floorsAboveGround: characteristics.floorsAboveGround,
      floorsBelowGround: characteristics.floorsBelowGround,
    },
  });
  return characteristics;
}

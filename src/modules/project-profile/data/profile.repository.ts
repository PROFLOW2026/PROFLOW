import { and, eq } from 'drizzle-orm';
import { projectConstructionCharacteristics, projectDeliveryProfiles } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import {
  EMPTY_CHARACTERISTICS,
  isConstructionCategory,
  isConstructionMethod,
  type ConstructionCharacteristics,
} from '../domain/characteristics';
import {
  STANDARD_PROFILE,
  isOwnershipModel,
  normalizeOperatingRoles,
  type DeliveryProfile,
} from '../domain/profile';

export interface StoredDeliveryProfile extends DeliveryProfile {
  readonly id: string;
  readonly updatedAt: Date;
}

export interface StoredCharacteristics extends ConstructionCharacteristics {
  readonly id: string;
  readonly updatedAt: Date;
}

export async function findDeliveryProfile(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<StoredDeliveryProfile | null> {
  const [row] = await db
    .select()
    .from(projectDeliveryProfiles)
    .where(
      and(
        eq(projectDeliveryProfiles.organizationId, organizationId),
        eq(projectDeliveryProfiles.projectId, projectId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    operatingRoles: normalizeOperatingRoles(row.operatingRoles ?? []),
    ownershipModel: isOwnershipModel(row.ownershipModel) ? row.ownershipModel : STANDARD_PROFILE.ownershipModel,
    developerEntityName: row.developerEntityName,
    notes: row.notes,
    updatedAt: row.updatedAt,
  };
}

export async function upsertDeliveryProfile(
  db: DbExecutor,
  input: { organizationId: string; projectId: string; userId: string; profile: DeliveryProfile },
): Promise<void> {
  const values = {
    operatingRoles: [...input.profile.operatingRoles],
    ownershipModel: input.profile.ownershipModel,
    developerEntityName: input.profile.developerEntityName,
    notes: input.profile.notes,
    updatedByUserId: input.userId,
  };
  await db
    .insert(projectDeliveryProfiles)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      createdByUserId: input.userId,
      ...values,
    })
    .onConflictDoUpdate({
      target: [projectDeliveryProfiles.organizationId, projectDeliveryProfiles.projectId],
      set: { ...values, updatedAt: new Date() },
    });
}

export async function findCharacteristics(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<StoredCharacteristics | null> {
  const [row] = await db
    .select()
    .from(projectConstructionCharacteristics)
    .where(
      and(
        eq(projectConstructionCharacteristics.organizationId, organizationId),
        eq(projectConstructionCharacteristics.projectId, projectId),
      ),
    )
    .limit(1);
  if (!row) return null;
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(row.customMetadata ?? {})) {
    if (typeof value === 'string') metadata[key] = value;
  }
  return {
    ...EMPTY_CHARACTERISTICS,
    id: row.id,
    category: isConstructionCategory(row.category) ? row.category : null,
    constructionMethod: isConstructionMethod(row.constructionMethod) ? row.constructionMethod : null,
    buildingsCount: row.buildingsCount,
    floorsAboveGround: row.floorsAboveGround,
    floorsBelowGround: row.floorsBelowGround,
    residentialUnits: row.residentialUnits,
    commercialUnits: row.commercialUnits,
    parkingLevels: row.parkingLevels,
    hasPublicAreas: row.hasPublicAreas,
    builtAreaSqm: row.builtAreaSqm,
    commercialAreaSqm: row.commercialAreaSqm,
    commonAreaSqm: row.commonAreaSqm,
    siteAreaSqm: row.siteAreaSqm,
    customMetadata: metadata,
    updatedAt: row.updatedAt,
  };
}

export async function upsertCharacteristics(
  db: DbExecutor,
  input: {
    organizationId: string;
    projectId: string;
    userId: string;
    characteristics: ConstructionCharacteristics;
  },
): Promise<void> {
  const c = input.characteristics;
  const values = {
    category: c.category,
    constructionMethod: c.constructionMethod,
    buildingsCount: c.buildingsCount,
    floorsAboveGround: c.floorsAboveGround,
    floorsBelowGround: c.floorsBelowGround,
    residentialUnits: c.residentialUnits,
    commercialUnits: c.commercialUnits,
    parkingLevels: c.parkingLevels,
    hasPublicAreas: c.hasPublicAreas,
    builtAreaSqm: c.builtAreaSqm,
    commercialAreaSqm: c.commercialAreaSqm,
    commonAreaSqm: c.commonAreaSqm,
    siteAreaSqm: c.siteAreaSqm,
    customMetadata: { ...c.customMetadata },
    updatedByUserId: input.userId,
  };
  await db
    .insert(projectConstructionCharacteristics)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      createdByUserId: input.userId,
      ...values,
    })
    .onConflictDoUpdate({
      target: [
        projectConstructionCharacteristics.organizationId,
        projectConstructionCharacteristics.projectId,
      ],
      set: { ...values, updatedAt: new Date() },
    });
}

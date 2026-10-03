'use server';

import { refresh } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  acceptRecommendations,
  archiveProjectLocation,
  createProjectLocation,
  dismissRecommendations,
  generateProjectLocations,
  moveProjectLocation,
  restoreProjectLocation,
  restoreRecommendations,
  updateConstructionCharacteristics,
  updateDeliveryProfile,
  updateProjectLocationDetails,
  type LocationGeneratorLabels,
  type Recommendation,
} from '@/modules/project-profile';
import { withOrgContext } from '@/shared/auth/session';
import { mapServerActionError } from '@/shared/errors';
import type {
  CreateLocationPayload,
  GenerateLocationsPayload,
  LocationRefPayload,
  MoveLocationPayload,
  RecommendationKeysPayload,
  SaveCharacteristicsPayload,
  SaveProfilePayload,
  StructureActionResult,
  UpdateLocationPayload,
} from './types';

async function toFailure(error: unknown): Promise<StructureActionResult> {
  const [tErrors, tProfile, tValidation] = await Promise.all([
    getTranslations('errors'),
    getTranslations('projectProfile'),
    getTranslations('validation'),
  ]);
  const mapped = mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    tValidation: (key) => tValidation(key as never),
    namespaces: { projectProfile: (key) => tProfile(key as never) },
  });
  return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
}

async function run(work: () => Promise<number | void>): Promise<StructureActionResult> {
  try {
    const count = await work();
    refresh();
    return typeof count === 'number' ? { ok: true, count } : { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

export async function saveDeliveryProfileAction(payload: SaveProfilePayload): Promise<StructureActionResult> {
  return run(async () => {
    await withOrgContext((context) => updateDeliveryProfile(context, payload));
  });
}

export async function saveCharacteristicsAction(payload: SaveCharacteristicsPayload): Promise<StructureActionResult> {
  return run(async () => {
    await withOrgContext((context) => updateConstructionCharacteristics(context, payload));
  });
}

export async function createLocationAction(payload: CreateLocationPayload): Promise<StructureActionResult> {
  return run(async () => {
    await withOrgContext((context) => createProjectLocation(context, payload));
  });
}

export async function updateLocationAction(payload: UpdateLocationPayload): Promise<StructureActionResult> {
  return run(async () => {
    await withOrgContext((context) => updateProjectLocationDetails(context, payload));
  });
}

export async function moveLocationAction(payload: MoveLocationPayload): Promise<StructureActionResult> {
  return run(async () => {
    await withOrgContext((context) => moveProjectLocation(context, payload));
  });
}

export async function archiveLocationAction(payload: LocationRefPayload): Promise<StructureActionResult> {
  return run(async () => {
    const result = await withOrgContext((context) => archiveProjectLocation(context, payload));
    return result.archivedCount;
  });
}

export async function restoreLocationAction(payload: LocationRefPayload): Promise<StructureActionResult> {
  return run(async () => {
    await withOrgContext((context) => restoreProjectLocation(context, payload));
  });
}

/** Templates keep the `{n}` placeholder; the generator fills it per node. */
async function generatorLabels(): Promise<LocationGeneratorLabels> {
  const t = await getTranslations('projectProfile.generator.labels');
  const n = { n: '{n}' };
  return {
    building: t('building', n),
    floor: t('floor', n),
    groundFloor: t('groundFloor'),
    basement: t('basement', n),
    parking: t('parking', n),
    roof: t('roof'),
    apartment: t('apartment', n),
    unit: t('unit', n),
  };
}

export async function generateLocationsAction(payload: GenerateLocationsPayload): Promise<StructureActionResult> {
  return run(async () => {
    const labels = await generatorLabels();
    const result = await withOrgContext((context) => generateProjectLocations(context, payload, labels));
    return result.createdCount;
  });
}

export async function acceptRecommendationsAction(payload: RecommendationKeysPayload): Promise<StructureActionResult> {
  return run(async () => {
    const t = await getTranslations('projectProfile.recommendations.items');
    const title = (item: Recommendation) => t(`${item.kind}.${item.code}`, { n: item.params.n ?? '' });
    const result = await withOrgContext((context) => acceptRecommendations(context, payload, title));
    return result.accepted.length;
  });
}

export async function dismissRecommendationsAction(payload: RecommendationKeysPayload): Promise<StructureActionResult> {
  return run(async () => {
    const result = await withOrgContext((context) => dismissRecommendations(context, payload));
    return result.dismissedKeys.length;
  });
}

export async function restoreRecommendationsAction(payload: RecommendationKeysPayload): Promise<StructureActionResult> {
  return run(async () => {
    const result = await withOrgContext((context) => restoreRecommendations(context, payload));
    return result.restoredKeys.length;
  });
}

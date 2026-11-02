import { randomUUID } from 'node:crypto';
import { internalActor } from '@/shared/actor';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DOMAIN_EVENTS, emitDomainEvent, type DomainEventType } from '@/shared/domain-events';
import { ConflictError, DomainRuleError, NotFoundError } from '@/shared/errors';
import {
  GENERATOR_LIMITS,
  planLevels,
  planLocationTree,
  validateGeneratorSpec,
  type LocationGeneratorLabels,
} from '../domain/location-generator';
import {
  MAX_LOCATION_DEPTH,
  buildLocationIndex,
  collectSubtreeIds,
  formatLocationLabel,
  locationDepth,
  nextSiblingSortOrder,
  wouldCreateCycle,
  type LocationNode,
} from '../domain/locations';
import {
  planDepthLevels,
  planStructure,
  unitLocationType,
  unitName,
  validateWizardSpec,
  type UnitKind,
  type WizardSpec,
} from '../domain/structure-wizard';
import {
  buildingOf,
  isUnitType,
  suggestUnitNumber,
  validateExtraLevels,
  validateSpaceLevel,
} from '../domain/unit-levels';
import {
  countProjectLocations,
  findLocationsByIds,
  findProjectLocation,
  insertLocations,
  listProjectLocations,
  listSiblingCodes,
  patchLocationMetadata,
  setLocationsArchived,
  updateProjectLocation,
  type LocationRecord,
  type NewLocationRow,
} from '../data/locations.repository';
import {
  addUnitsSchema,
  createLocationSchema,
  createStructureSchema,
  generateLocationsSchema,
  locationRefSchema,
  moveLocationSchema,
  setSpaceLevelSchema,
  setUnitKindSchema,
  setUnitLevelsSchema,
  updateLocationSchema,
  type AddUnitsInput,
  type CreateLocationInput,
  type CreateStructureInput,
  type GenerateLocationsInput,
  type MoveLocationInput,
  type SetSpaceLevelInput,
  type SetUnitKindInput,
  type SetUnitLevelsInput,
  type UpdateLocationInput,
} from '../validation/schemas';
import { CAP, parseInput, requireProjectWith } from './authorize';

/** Hard cap per project so a runaway generator cannot bloat the table. */
export const MAX_LOCATIONS_PER_PROJECT = 20000;

function toNode(record: LocationRecord): LocationNode {
  return {
    id: record.id,
    parentId: record.parentId,
    name: record.name,
    code: record.code,
    type: record.type,
    sortOrder: record.sortOrder,
    isActive: record.isActive,
    archived: record.archived,
    ...(record.extraLevelIds ? { extraLevelIds: record.extraLevelIds } : {}),
    ...(record.levelId ? { levelId: record.levelId } : {}),
    ...(record.structure ? { structure: record.structure } : {}),
    ...(record.unitKind ? { unitKind: record.unitKind } : {}),
  };
}

function unitNameConflict(): ConflictError {
  return new ConflictError('Unit number already used in this building', 'projectProfile.errors.unitNameTaken');
}

/** A unit number / name must be unique among the live units of its building (archived ones free theirs). */
function assertUnitNameFree(
  tree: readonly LocationRecord[],
  parentId: string | null,
  name: string,
  excludeId: string | null,
): void {
  const index = buildLocationIndex(tree.map(toNode));
  const building = parentId ? buildingOf(index, parentId) : null;
  const wanted = name.trim().toLowerCase();
  for (const node of tree) {
    if (node.archived || node.id === excludeId || !isUnitType(node.type)) continue;
    if (node.name.trim().toLowerCase() !== wanted) continue;
    if ((node.parentId ? buildingOf(index, node.parentId) : null) === building) throw unitNameConflict();
  }
}

async function emitLocationEvent(
  context: OrgContext,
  projectId: string,
  type: DomainEventType,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId,
    type,
    entityType: 'project_location',
    entityId,
    actor: internalActor(context.userId),
    payload,
  });
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } } | null)?.code ??
    (error as { cause?: { code?: string } } | null)?.cause?.code;
  return code === '23505';
}

function codeConflict(): ConflictError {
  return new ConflictError('Location code already used under this parent', 'projectProfile.errors.codeConflict');
}

/** Active location tree for pickers (requires `project.view`). Serialisable for client components. */
export async function listLocationOptions(context: OrgContext, projectId: string): Promise<LocationNode[]> {
  await requireProjectWith(context, projectId, CAP.VIEW);
  const rows = await listProjectLocations(context.db, context.organizationId, projectId);
  return rows.filter((row) => row.isActive).map(toNode);
}

/** Full tree including archived (management screen). */
export async function listLocationTree(context: OrgContext, projectId: string): Promise<LocationNode[]> {
  await requireProjectWith(context, projectId, CAP.VIEW);
  const rows = await listProjectLocations(context.db, context.organizationId, projectId, { includeArchived: true });
  return rows.map(toNode);
}

/**
 * Full-path labels for locations referenced by other entities (any project the caller can see
 * under RLS). Unknown / invisible ids are simply absent.
 */
export async function resolveLocationLabels(
  context: OrgContext,
  locationIds: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(locationIds.filter((id): id is string => Boolean(id)))];
  const labels = new Map<string, string>();
  if (ids.length === 0) return labels;
  const found = await findLocationsByIds(context.db, context.organizationId, ids);
  const projectIds = [...new Set(found.map((row) => row.projectId))];
  for (const projectId of projectIds) {
    const tree = await listProjectLocations(context.db, context.organizationId, projectId, { includeArchived: true });
    const index = buildLocationIndex(tree.map(toNode));
    for (const row of found) {
      if (row.projectId !== projectId) continue;
      const label = formatLocationLabel(index, row.id);
      if (label) labels.set(row.id, label);
    }
  }
  return labels;
}

async function loadParent(
  context: OrgContext,
  projectId: string,
  parentId: string | null,
): Promise<LocationRecord | null> {
  if (!parentId) return null;
  const parent = await findProjectLocation(context.db, context.organizationId, projectId, parentId);
  if (!parent) throw new NotFoundError('Location');
  if (parent.archived) {
    throw new DomainRuleError('Parent location is archived', 'projectProfile.errors.parentArchived');
  }
  return parent;
}

export async function createProjectLocation(
  context: OrgContext,
  rawInput: CreateLocationInput,
): Promise<LocationNode> {
  const input = parseInput(createLocationSchema, rawInput);
  await requireProjectWith(context, input.projectId, CAP.MANAGE);
  await loadParent(context, input.projectId, input.parentId);

  const tree = await listProjectLocations(context.db, context.organizationId, input.projectId, { includeArchived: true });
  if (tree.length >= MAX_LOCATIONS_PER_PROJECT) {
    throw new DomainRuleError('Too many locations', 'projectProfile.errors.tooManyLocations');
  }
  const index = buildLocationIndex(tree.map(toNode));
  if (input.parentId && locationDepth(index, input.parentId) + 1 >= MAX_LOCATION_DEPTH) {
    throw new DomainRuleError('Hierarchy too deep', 'projectProfile.errors.tooDeep');
  }
  if (input.code) {
    const codes = await listSiblingCodes(context.db, context.organizationId, input.projectId, input.parentId);
    if (codes.has(input.code.toLowerCase())) throw codeConflict();
  }
  if (isUnitType(input.type)) assertUnitNameFree(tree, input.parentId, input.name, null);

  const id = randomUUID();
  try {
    await insertLocations(context.db, [
      {
        id,
        organizationId: context.organizationId,
        projectId: input.projectId,
        parentId: input.parentId,
        type: input.type,
        name: input.name,
        code: input.code,
        sortOrder: nextSiblingSortOrder(index, input.parentId),
        createdByUserId: context.userId,
      },
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) throw codeConflict();
    throw error;
  }

  const created = await findProjectLocation(context.db, context.organizationId, input.projectId, id);
  if (!created) throw new NotFoundError('Location');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_LOCATION_CREATED,
    entityType: 'project_location',
    entityId: id,
    after: { projectId: input.projectId, parentId: input.parentId, type: input.type, name: input.name, code: input.code },
  });
  await emitLocationEvent(context, input.projectId, DOMAIN_EVENTS.PROFILE_LOCATION_CREATED, id, {
    parentId: input.parentId,
    type: input.type,
  });
  return toNode(created);
}

export async function updateProjectLocationDetails(
  context: OrgContext,
  rawInput: UpdateLocationInput,
): Promise<LocationNode> {
  const input = parseInput(updateLocationSchema, rawInput);
  await requireProjectWith(context, input.projectId, CAP.MANAGE);
  const existing = await findProjectLocation(context.db, context.organizationId, input.projectId, input.locationId);
  if (!existing) throw new NotFoundError('Location');
  if (existing.archived) {
    throw new DomainRuleError('Archived location', 'projectProfile.errors.locationArchived');
  }
  if (input.code && input.code.toLowerCase() !== existing.code?.toLowerCase()) {
    const codes = await listSiblingCodes(context.db, context.organizationId, input.projectId, existing.parentId);
    if (codes.has(input.code.toLowerCase())) throw codeConflict();
  }
  const nextType = input.type ?? existing.type;
  if (isUnitType(nextType) && (input.name !== undefined || input.type !== undefined)) {
    const nextName = input.name ?? existing.name;
    if (nextName.trim().toLowerCase() !== existing.name.trim().toLowerCase() || !isUnitType(existing.type)) {
      const tree = await listProjectLocations(context.db, context.organizationId, input.projectId, { includeArchived: true });
      assertUnitNameFree(tree, existing.parentId, nextName, existing.id);
    }
  }

  let updated: LocationRecord | null;
  try {
    updated = await updateProjectLocation(context.db, context.organizationId, input.projectId, input.locationId, {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw codeConflict();
    throw error;
  }
  if (!updated) throw new NotFoundError('Location');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_LOCATION_UPDATED,
    entityType: 'project_location',
    entityId: updated.id,
    before: { name: existing.name, code: existing.code, type: existing.type, isActive: existing.isActive },
    after: { name: updated.name, code: updated.code, type: updated.type, isActive: updated.isActive },
  });
  await emitLocationEvent(context, input.projectId, DOMAIN_EVENTS.PROFILE_LOCATION_UPDATED, updated.id, {
    type: updated.type,
    isActive: updated.isActive,
  });
  return toNode(updated);
}

export async function moveProjectLocation(context: OrgContext, rawInput: MoveLocationInput): Promise<LocationNode> {
  const input = parseInput(moveLocationSchema, rawInput);
  await requireProjectWith(context, input.projectId, CAP.MANAGE);
  const existing = await findProjectLocation(context.db, context.organizationId, input.projectId, input.locationId);
  if (!existing) throw new NotFoundError('Location');
  if (existing.parentId === input.parentId) return toNode(existing);
  await loadParent(context, input.projectId, input.parentId);

  const tree = await listProjectLocations(context.db, context.organizationId, input.projectId, { includeArchived: true });
  const index = buildLocationIndex(tree.map(toNode));
  if (wouldCreateCycle(index, input.locationId, input.parentId)) {
    throw new DomainRuleError('A location cannot move under itself', 'projectProfile.errors.cycle');
  }
  if (existing.code) {
    const codes = await listSiblingCodes(context.db, context.organizationId, input.projectId, input.parentId);
    if (codes.has(existing.code.toLowerCase())) throw codeConflict();
  }
  if (isUnitType(existing.type)) assertUnitNameFree(tree, input.parentId, existing.name, existing.id);

  const updated = await updateProjectLocation(context.db, context.organizationId, input.projectId, input.locationId, {
    parentId: input.parentId,
    sortOrder: nextSiblingSortOrder(index, input.parentId),
  });
  if (!updated) throw new NotFoundError('Location');
  if (isUnitType(existing.type) && (existing.extraLevelIds?.length ?? 0) > 0) {
    // Changing the primary level keeps the unit (same id, same folder). Extra levels stay only while they
    // are in the same building and differ from the new primary level.
    const sameBuilding =
      (existing.parentId ? buildingOf(index, existing.parentId) : null) ===
      (input.parentId ? buildingOf(index, input.parentId) : null);
    const keep = sameBuilding ? (existing.extraLevelIds ?? []).filter((id) => id !== input.parentId) : [];
    if (keep.length !== existing.extraLevelIds?.length) {
      await patchLocationMetadata(
        context.db,
        context.organizationId,
        input.projectId,
        input.locationId,
        keep.length > 0 ? { set: { extraLevelIds: keep } } : { remove: ['extraLevelIds'] },
      );
    }
  }
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_LOCATION_MOVED,
    entityType: 'project_location',
    entityId: updated.id,
    before: { parentId: existing.parentId },
    after: { parentId: updated.parentId },
  });
  await emitLocationEvent(context, input.projectId, DOMAIN_EVENTS.PROFILE_LOCATION_MOVED, updated.id, {
    fromParentId: existing.parentId,
    toParentId: updated.parentId,
  });
  return toNode(updated);
}

/** Archives the location and its whole subtree (soft; references on other entities stay intact). */
export async function archiveProjectLocation(
  context: OrgContext,
  rawInput: { projectId: string; locationId: string },
): Promise<{ archivedCount: number }> {
  const input = parseInput(locationRefSchema, rawInput);
  await requireProjectWith(context, input.projectId, CAP.MANAGE);
  const tree = await listProjectLocations(context.db, context.organizationId, input.projectId, { includeArchived: true });
  const target = tree.find((row) => row.id === input.locationId);
  if (!target) throw new NotFoundError('Location');
  if (target.archived) return { archivedCount: 0 };

  const index = buildLocationIndex(tree.map(toNode));
  const ids = collectSubtreeIds(index, input.locationId).filter((id) => !index.byId.get(id)?.archived);
  const archivedCount = await setLocationsArchived(context.db, context.organizationId, input.projectId, ids, new Date());

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_LOCATION_ARCHIVED,
    entityType: 'project_location',
    entityId: input.locationId,
    before: { name: target.name, code: target.code },
    metadata: { archivedCount },
  });
  await emitLocationEvent(context, input.projectId, DOMAIN_EVENTS.PROFILE_LOCATION_ARCHIVED, input.locationId, {
    archivedCount,
  });
  return { archivedCount };
}

/** Restores one archived location (its parent must be active) - children stay archived until restored. */
export async function restoreProjectLocation(
  context: OrgContext,
  rawInput: { projectId: string; locationId: string },
): Promise<LocationNode> {
  const input = parseInput(locationRefSchema, rawInput);
  await requireProjectWith(context, input.projectId, CAP.MANAGE);
  const existing = await findProjectLocation(context.db, context.organizationId, input.projectId, input.locationId);
  if (!existing) throw new NotFoundError('Location');
  if (!existing.archived) return toNode(existing);
  await loadParent(context, input.projectId, existing.parentId);
  if (existing.code) {
    const codes = await listSiblingCodes(context.db, context.organizationId, input.projectId, existing.parentId);
    if (codes.has(existing.code.toLowerCase())) throw codeConflict();
  }

  await setLocationsArchived(context.db, context.organizationId, input.projectId, [input.locationId], null);
  const restored = await findProjectLocation(context.db, context.organizationId, input.projectId, input.locationId);
  if (!restored) throw new NotFoundError('Location');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_LOCATION_RESTORED,
    entityType: 'project_location',
    entityId: input.locationId,
    after: { name: restored.name, code: restored.code },
  });
  await emitLocationEvent(context, input.projectId, DOMAIN_EVENTS.PROFILE_LOCATION_RESTORED, input.locationId, {});
  return toNode(restored);
}

export interface GenerateLocationsResult {
  readonly createdCount: number;
  readonly rootIds: readonly string[];
}

/**
 * Bulk generator. Inserts level by level (parents first) with pre-assigned ids, all inside the
 * caller's transaction, so a failure leaves nothing behind.
 */
export async function generateProjectLocations(
  context: OrgContext,
  rawInput: GenerateLocationsInput,
  labels: LocationGeneratorLabels,
): Promise<GenerateLocationsResult> {
  const input = parseInput(generateLocationsSchema, rawInput);
  await requireProjectWith(context, input.projectId, CAP.MANAGE);

  const issues = validateGeneratorSpec(input.spec);
  if (issues.length > 0) {
    throw new DomainRuleError(`Invalid generator spec: ${issues.join(',')}`, `projectProfile.errors.generator.${issues[0]}`);
  }
  await loadParent(context, input.projectId, input.parentId);

  const plan = planLocationTree(input.spec, labels);
  const existingCount = await countProjectLocations(context.db, context.organizationId, input.projectId);
  if (existingCount + plan.length > MAX_LOCATIONS_PER_PROJECT || plan.length > GENERATOR_LIMITS.maxNodes) {
    throw new DomainRuleError('Too many locations', 'projectProfile.errors.tooManyLocations');
  }

  const rootCodes = await listSiblingCodes(context.db, context.organizationId, input.projectId, input.parentId);
  if (plan.some((node) => node.parentKey === null && rootCodes.has(node.code.toLowerCase()))) {
    throw codeConflict();
  }

  const tree = await listProjectLocations(context.db, context.organizationId, input.projectId);
  const index = buildLocationIndex(tree.map(toNode));
  const rootSortStart = nextSiblingSortOrder(index, input.parentId);

  const ids = new Map<string, string>();
  for (const node of plan) ids.set(node.key, randomUUID());

  const CHUNK = 500;
  try {
    for (const level of planLevels(plan)) {
      const rows: NewLocationRow[] = level.map((node) => ({
        id: ids.get(node.key)!,
        organizationId: context.organizationId,
        projectId: input.projectId,
        parentId: node.parentKey ? ids.get(node.parentKey)! : input.parentId,
        type: node.type,
        name: node.name,
        code: node.code,
        sortOrder: node.parentKey ? node.sortOrder : rootSortStart + node.sortOrder,
        createdByUserId: context.userId,
        metadata: { generated: true },
      }));
      for (let offset = 0; offset < rows.length; offset += CHUNK) {
        await insertLocations(context.db, rows.slice(offset, offset + CHUNK));
      }
    }
  } catch (error) {
    if (isUniqueViolation(error)) throw codeConflict();
    throw error;
  }

  const rootIds = plan.filter((node) => node.parentKey === null).map((node) => ids.get(node.key)!);
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_LOCATION_BULK_GENERATED,
    entityType: 'project',
    entityId: input.projectId,
    after: { parentId: input.parentId, spec: input.spec, createdCount: plan.length },
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.PROFILE_LOCATION_TREE_GENERATED,
    entityType: 'project',
    entityId: input.projectId,
    actor: internalActor(context.userId),
    payload: { parentId: input.parentId, createdCount: plan.length, buildings: input.spec.buildings },
  });
  return { createdCount: plan.length, rootIds };
}

// ── universal structure (wizard, units, levels) ────────────────────────────────────────────────────

export interface CreateStructureResult extends GenerateLocationsResult {
  readonly unitCount: number;
}

/**
 * Creates the whole structure the wizard described: database rows only (site / buildings / levels / units /
 * optional spaces). No cloud folder is created for any of them - folders appear on the first upload.
 */
export async function createProjectStructure(
  context: OrgContext,
  rawInput: CreateStructureInput,
): Promise<CreateStructureResult> {
  const input = parseInput(createStructureSchema, rawInput);
  await requireProjectWith(context, input.projectId, CAP.MANAGE);
  const spec = input.spec as unknown as WizardSpec;
  const issues = validateWizardSpec(spec);
  if (issues.length > 0) {
    throw new DomainRuleError(`Invalid structure: ${issues.join(',')}`, 'projectProfile.errors.structureInvalid');
  }
  await loadParent(context, input.projectId, input.parentId);

  const plan = planStructure(spec);
  const existingCount = await countProjectLocations(context.db, context.organizationId, input.projectId);
  if (existingCount + plan.length > MAX_LOCATIONS_PER_PROJECT) {
    throw new DomainRuleError('Too many locations', 'projectProfile.errors.tooManyLocations');
  }
  const tree = await listProjectLocations(context.db, context.organizationId, input.projectId);
  const index = buildLocationIndex(tree.map(toNode));
  if (input.parentId && locationDepth(index, input.parentId) + 1 + Math.max(...plan.map((node) => node.depth), 0) + 2 >= MAX_LOCATION_DEPTH) {
    throw new DomainRuleError('Hierarchy too deep', 'projectProfile.errors.tooDeep');
  }
  const rootSortStart = nextSiblingSortOrder(index, input.parentId);

  const ids = new Map<string, string>();
  for (const node of plan) ids.set(node.key, randomUUID());

  const CHUNK = 500;
  for (const level of planDepthLevels(plan)) {
    const rows: NewLocationRow[] = level.map((node) => ({
      id: ids.get(node.key)!,
      organizationId: context.organizationId,
      projectId: input.projectId,
      parentId: node.parentKey ? ids.get(node.parentKey)! : input.parentId,
      type: node.type,
      name: node.name,
      code: null,
      sortOrder: node.parentKey ? node.sortOrder : rootSortStart + node.sortOrder,
      createdByUserId: context.userId,
      metadata: {
        generated: true,
        ...(node.unitKind ? { unitKind: node.unitKind } : {}),
        ...(node.structure ? { structure: node.structure } : {}),
        ...(node.extraLevelKeys && node.extraLevelKeys.length > 0
          ? { extraLevelIds: node.extraLevelKeys.map((key) => ids.get(key)!).filter(Boolean) }
          : {}),
      },
    }));
    for (let offset = 0; offset < rows.length; offset += CHUNK) {
      await insertLocations(context.db, rows.slice(offset, offset + CHUNK));
    }
  }

  const rootIds = plan.filter((node) => node.parentKey === null).map((node) => ids.get(node.key)!);
  const unitCount = plan.filter((node) => node.role === 'unit').length;
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_LOCATION_BULK_GENERATED,
    entityType: 'project',
    entityId: input.projectId,
    after: { parentId: input.parentId, template: spec.template, createdCount: plan.length, unitCount },
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.PROFILE_LOCATION_TREE_GENERATED,
    entityType: 'project',
    entityId: input.projectId,
    actor: internalActor(context.userId),
    payload: { parentId: input.parentId, createdCount: plan.length, unitCount, template: spec.template },
  });
  return { createdCount: plan.length, rootIds, unitCount };
}

/**
 * Adds `count` units under a level (or any container), numbered after the highest number already used in the
 * building. Existing units are never renumbered.
 */
export async function addProjectUnits(
  context: OrgContext,
  rawInput: AddUnitsInput,
): Promise<{ createdIds: string[]; names: string[] }> {
  const input = parseInput(addUnitsSchema, rawInput);
  await requireProjectWith(context, input.projectId, CAP.MANAGE);
  const parent = await loadParent(context, input.projectId, input.parentId);
  if (!parent || isUnitType(parent.type)) {
    throw new DomainRuleError('A unit cannot be placed under a unit', 'projectProfile.errors.structureInvalid');
  }
  const kind: UnitKind = input.kind;
  const tree = await listProjectLocations(context.db, context.organizationId, input.projectId, { includeArchived: true });
  if (tree.length + input.count * (1 + (input.rooms?.length ?? 0)) > MAX_LOCATIONS_PER_PROJECT) {
    throw new DomainRuleError('Too many locations', 'projectProfile.errors.tooManyLocations');
  }
  const nodes = tree.map(toNode);
  const index = buildLocationIndex(nodes);
  const first = input.startNumber ?? suggestUnitNumber(nodes, input.parentId, kind);
  const names = Array.from({ length: input.count }, (_, offset) => unitName(kind, first + offset));
  for (const name of names) assertUnitNameFree(tree, input.parentId, name, null);

  const sortStart = nextSiblingSortOrder(index, input.parentId);
  const unitRows: NewLocationRow[] = [];
  const roomRows: NewLocationRow[] = [];
  const createdIds: string[] = [];
  names.forEach((name, offset) => {
    const id = randomUUID();
    createdIds.push(id);
    unitRows.push({
      id,
      organizationId: context.organizationId,
      projectId: input.projectId,
      parentId: input.parentId,
      type: unitLocationType(kind),
      name,
      code: null,
      sortOrder: sortStart + offset,
      createdByUserId: context.userId,
      metadata: { unitKind: kind },
    });
    (input.rooms ?? []).forEach((room, roomIndex) => {
      roomRows.push({
        organizationId: context.organizationId,
        projectId: input.projectId,
        parentId: id,
        type: 'room',
        name: room,
        code: null,
        sortOrder: roomIndex,
        createdByUserId: context.userId,
      });
    });
  });
  await insertLocations(context.db, unitRows);
  if (roomRows.length > 0) await insertLocations(context.db, roomRows);

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_LOCATION_CREATED,
    entityType: 'project_location',
    entityId: createdIds[0]!,
    after: { projectId: input.projectId, parentId: input.parentId, kind, names },
  });
  await emitLocationEvent(context, input.projectId, DOMAIN_EVENTS.PROFILE_LOCATION_CREATED, createdIds[0]!, {
    parentId: input.parentId,
    type: unitLocationType(kind),
    count: createdIds.length,
  });
  return { createdIds, names };
}

function levelLinkError(code: string): DomainRuleError {
  return new DomainRuleError(`Invalid level link: ${code}`, 'projectProfile.errors.levelLink');
}

/** Sets the additional levels of a multi-level unit. The unit keeps its id; files and folders are untouched. */
export async function setUnitLevels(context: OrgContext, rawInput: SetUnitLevelsInput): Promise<LocationNode> {
  const input = parseInput(setUnitLevelsSchema, rawInput);
  await requireProjectWith(context, input.projectId, CAP.MANAGE);
  const tree = await listProjectLocations(context.db, context.organizationId, input.projectId, { includeArchived: true });
  const index = buildLocationIndex(tree.map(toNode));
  const unit = tree.find((row) => row.id === input.unitId);
  if (!unit) throw new NotFoundError('Location');
  if (unit.archived) throw new DomainRuleError('Archived location', 'projectProfile.errors.locationArchived');
  const problem = validateExtraLevels(index, input.unitId, input.extraLevelIds);
  if (problem) throw levelLinkError(problem);

  await patchLocationMetadata(
    context.db,
    context.organizationId,
    input.projectId,
    input.unitId,
    input.extraLevelIds.length > 0 ? { set: { extraLevelIds: input.extraLevelIds } } : { remove: ['extraLevelIds'] },
  );
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_LOCATION_UPDATED,
    entityType: 'project_location',
    entityId: input.unitId,
    before: { extraLevelIds: unit.extraLevelIds ?? [] },
    after: { extraLevelIds: input.extraLevelIds },
  });
  await emitLocationEvent(context, input.projectId, DOMAIN_EVENTS.PROFILE_LOCATION_UPDATED, input.unitId, {
    extraLevelCount: input.extraLevelIds.length,
  });
  const updated = await findProjectLocation(context.db, context.organizationId, input.projectId, input.unitId);
  if (!updated) throw new NotFoundError('Location');
  return toNode(updated);
}

/** Tags a space (room) with the level it is on - for example the upper floor of a duplex. */
export async function setSpaceLevel(context: OrgContext, rawInput: SetSpaceLevelInput): Promise<LocationNode> {
  const input = parseInput(setSpaceLevelSchema, rawInput);
  await requireProjectWith(context, input.projectId, CAP.MANAGE);
  const tree = await listProjectLocations(context.db, context.organizationId, input.projectId, { includeArchived: true });
  const index = buildLocationIndex(tree.map(toNode));
  const problem = validateSpaceLevel(index, input.spaceId, input.levelId);
  if (problem) throw levelLinkError(problem);
  await patchLocationMetadata(
    context.db,
    context.organizationId,
    input.projectId,
    input.spaceId,
    input.levelId ? { set: { levelId: input.levelId } } : { remove: ['levelId'] },
  );
  await emitLocationEvent(context, input.projectId, DOMAIN_EVENTS.PROFILE_LOCATION_UPDATED, input.spaceId, {
    levelId: input.levelId,
  });
  const updated = await findProjectLocation(context.db, context.organizationId, input.projectId, input.spaceId);
  if (!updated) throw new NotFoundError('Location');
  return toNode(updated);
}

/** Changes the kind of a unit (apartment / penthouse / shop / office ...). The row, its id and links stay. */
export async function setUnitKind(context: OrgContext, rawInput: SetUnitKindInput): Promise<LocationNode> {
  const input = parseInput(setUnitKindSchema, rawInput);
  await requireProjectWith(context, input.projectId, CAP.MANAGE);
  const existing = await findProjectLocation(context.db, context.organizationId, input.projectId, input.unitId);
  if (!existing) throw new NotFoundError('Location');
  if (!isUnitType(existing.type)) throw new DomainRuleError('Not a unit', 'projectProfile.errors.structureInvalid');
  const updated = await updateProjectLocation(context.db, context.organizationId, input.projectId, input.unitId, {
    type: unitLocationType(input.kind),
  });
  await patchLocationMetadata(context.db, context.organizationId, input.projectId, input.unitId, {
    set: { unitKind: input.kind },
  });
  if (!updated) throw new NotFoundError('Location');
  await emitLocationEvent(context, input.projectId, DOMAIN_EVENTS.PROFILE_LOCATION_UPDATED, input.unitId, {
    unitKind: input.kind,
  });
  return toNode({ ...updated, unitKind: input.kind });
}


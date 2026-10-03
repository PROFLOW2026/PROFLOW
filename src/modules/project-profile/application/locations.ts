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
  countProjectLocations,
  findLocationsByIds,
  findProjectLocation,
  insertLocations,
  listProjectLocations,
  listSiblingCodes,
  setLocationsArchived,
  updateProjectLocation,
  type LocationRecord,
  type NewLocationRow,
} from '../data/locations.repository';
import {
  createLocationSchema,
  generateLocationsSchema,
  locationRefSchema,
  moveLocationSchema,
  updateLocationSchema,
  type CreateLocationInput,
  type GenerateLocationsInput,
  type MoveLocationInput,
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
  };
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

  const updated = await updateProjectLocation(context.db, context.organizationId, input.projectId, input.locationId, {
    parentId: input.parentId,
    sortOrder: nextSiblingSortOrder(index, input.parentId),
  });
  if (!updated) throw new NotFoundError('Location');
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

import { ConflictError, DomainRuleError, NotFoundError } from '@/shared/errors';
import type { FolderMappingRow } from '../data/infra.repository';
import { subtreeIds, type LocationTreeNode } from '../domain/filters';
import { INFRA_ROOT_FOLDER_NAME, infraFolderNameForLocation, uniqueFolderName } from '../domain/folder-naming';

/**
 * Real folder operations for the infrastructure tree in the organization's cloud storage.
 *
 * The location tree (project_locations) IS the folder tree: every location owns one provider folder,
 * nested exactly like the location hierarchy, under "<project>/תיעוד תשתיות". The mapping
 * (infra_folder_mappings: location <-> provider folder id) survives renames and moves because it is
 * keyed by the provider folder id, never by a path or a name.
 *
 * This module is provider-agnostic and DB-agnostic: it talks to a narrow adapter and a mapping
 * store, so it is unit-testable without a database or a network.
 */

export interface FolderItem {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
}

/** The subset of the storage provider adapter the folder service needs. */
export interface FolderAdapter {
  getFolder(folderId: string): Promise<FolderItem | null>;
  /** Finds a direct child folder by exact name. */
  findChildByName(parentId: string, name: string): Promise<FolderItem | null>;
  createFolder(input: { name: string; parentId: string }): Promise<FolderItem>;
  renameFolder(folderId: string, name: string): Promise<FolderItem>;
  moveFolder(folderId: string, newParentId: string): Promise<FolderItem>;
}

export interface FolderMappingStore {
  list(): Promise<readonly FolderMappingRow[]>;
  insert(row: {
    locationId: string | null;
    externalFolderId: string;
    externalParentId: string | null;
    displayName: string;
    origin: 'auto' | 'linked_existing';
    status: 'pending' | 'ready' | 'error';
    lastError: string | null;
  }): Promise<FolderMappingRow>;
  update(
    mappingId: string,
    patch: Partial<{
      externalFolderId: string;
      externalParentId: string | null;
      displayName: string;
      origin: 'auto' | 'linked_existing';
      status: 'pending' | 'ready' | 'error';
      lastError: string | null;
      lastVerifiedAt: Date | null;
    }>,
  ): Promise<void>;
  remove(mappingId: string): Promise<void>;
}

export interface FolderContext {
  readonly adapter: FolderAdapter;
  readonly store: FolderMappingStore;
  /** The project's own folder in the cloud; the infrastructure root lives directly under it. */
  readonly projectFolderId: string;
  /** Whole location tree of the project (archived included). */
  readonly tree: readonly (LocationTreeNode & { readonly archived?: boolean })[];
}

function byLocation(rows: readonly FolderMappingRow[]): Map<string | null, FolderMappingRow> {
  const map = new Map<string | null, FolderMappingRow>();
  for (const row of rows) map.set(row.locationId, row);
  return map;
}

function chainFor(tree: FolderContext['tree'], locationId: string): LocationTreeNode[] {
  const byId = new Map(tree.map((node) => [node.id, node]));
  const chain: LocationTreeNode[] = [];
  const seen = new Set<string>();
  let cursor = byId.get(locationId) ?? null;
  while (cursor && !seen.has(cursor.id) && chain.length < 40) {
    seen.add(cursor.id);
    chain.unshift(cursor);
    cursor = cursor.parentId ? (byId.get(cursor.parentId) ?? null) : null;
  }
  if (chain.length === 0) throw new NotFoundError('Location');
  return chain;
}

async function resolveOrCreateChild(
  adapter: FolderAdapter,
  parentId: string,
  name: string,
): Promise<FolderItem> {
  const existing = await adapter.findChildByName(parentId, name);
  if (existing) return existing;
  try {
    return await adapter.createFolder({ name, parentId });
  } catch (error) {
    // Name collision from a concurrent writer: the folder exists now.
    const again = await adapter.findChildByName(parentId, name);
    if (again) return again;
    throw error;
  }
}

/** Ready mapping whose provider folder still exists (a deleted / moved-away folder is rebuilt). */
async function usable(adapter: FolderAdapter, row: FolderMappingRow | undefined): Promise<FolderMappingRow | null> {
  if (!row || row.status !== 'ready' || !row.externalFolderId || row.externalFolderId === 'pending') return null;
  const folder = await adapter.getFolder(row.externalFolderId);
  return folder ? row : null;
}

/** The project's infrastructure root folder (created on first use). */
export async function ensureInfraRoot(context: FolderContext): Promise<FolderMappingRow> {
  const rows = await context.store.list();
  const existing = byLocation(rows).get(null);
  const alive = await usable(context.adapter, existing);
  if (alive) return alive;

  const folder = await resolveOrCreateChild(context.adapter, context.projectFolderId, INFRA_ROOT_FOLDER_NAME);
  if (existing) {
    await context.store.update(existing.id, {
      externalFolderId: folder.id,
      externalParentId: context.projectFolderId,
      displayName: folder.name,
      status: 'ready',
      lastError: null,
      lastVerifiedAt: new Date(),
    });
    return { ...existing, externalFolderId: folder.id, status: 'ready' };
  }
  return context.store.insert({
    locationId: null,
    externalFolderId: folder.id,
    externalParentId: context.projectFolderId,
    displayName: folder.name,
    origin: 'auto',
    status: 'ready',
    lastError: null,
  });
}

function siblingFolderNames(
  rows: readonly FolderMappingRow[],
  tree: FolderContext['tree'],
  parentLocationId: string | null,
  exceptLocationId: string,
): Set<string> {
  const siblingIds = new Set(
    tree.filter((node) => node.parentId === parentLocationId && node.id !== exceptLocationId).map((node) => node.id),
  );
  const names = new Set<string>();
  for (const row of rows) {
    if (row.locationId && siblingIds.has(row.locationId)) names.add(row.displayName);
  }
  return names;
}

/**
 * Returns the provider folder id of `locationId`, creating the root and every missing ancestor
 * folder on the way. Idempotent: running it twice creates nothing the second time.
 */
export async function ensureLocationFolder(context: FolderContext, locationId: string): Promise<string> {
  const chain = chainFor(context.tree, locationId);
  const root = await ensureInfraRoot(context);
  let rows = [...(await context.store.list())];
  let parentFolderId = root.externalFolderId;

  for (let depth = 0; depth < chain.length; depth += 1) {
    const node = chain[depth]!;
    const existing = byLocation(rows).get(node.id);
    const alive = await usable(context.adapter, existing);
    if (alive) {
      parentFolderId = alive.externalFolderId;
      continue;
    }
    const parentLocationId = depth === 0 ? null : chain[depth - 1]!.id;
    const baseName = infraFolderNameForLocation(node);
    const name = uniqueFolderName(baseName, siblingFolderNames(rows, context.tree, parentLocationId, node.id));
    const folder = await resolveOrCreateChild(context.adapter, parentFolderId, name);

    if (existing) {
      await context.store.update(existing.id, {
        externalFolderId: folder.id,
        externalParentId: parentFolderId,
        displayName: folder.name,
        status: 'ready',
        lastError: null,
        lastVerifiedAt: new Date(),
      });
      rows = rows.map((row) =>
        row.id === existing.id ? { ...row, externalFolderId: folder.id, displayName: folder.name, status: 'ready' as const } : row,
      );
    } else {
      const inserted = await context.store.insert({
        locationId: node.id,
        externalFolderId: folder.id,
        externalParentId: parentFolderId,
        displayName: folder.name,
        origin: 'auto',
        status: 'ready',
        lastError: null,
      });
      rows = [...rows, inserted];
    }
    parentFolderId = folder.id;
  }
  return parentFolderId;
}

export interface SyncResult {
  /** Locations whose folder was verified or created in this call. */
  readonly processed: number;
  readonly created: number;
  readonly failed: readonly { readonly locationId: string; readonly error: string }[];
  /** Locations of the target set still without a ready folder (call again until 0). */
  readonly remaining: number;
}

/**
 * Bulk folder creation for many locations (floors / apartments / areas) in paced batches: the
 * caller loops until `remaining` is 0. Parents are always handled before children.
 */
export async function syncLocationFolders(
  context: FolderContext,
  input: { readonly locationIds?: readonly string[] | null; readonly batchSize: number },
): Promise<SyncResult> {
  const active = context.tree.filter((node) => !node.archived);
  let targetIds: string[];
  if (input.locationIds && input.locationIds.length > 0) {
    const set = new Set<string>();
    for (const id of input.locationIds) for (const sub of subtreeIds(active, id)) set.add(sub);
    targetIds = [...set];
  } else {
    targetIds = active.map((node) => node.id);
  }
  const depthOf = (id: string) => chainFor(context.tree, id).length;
  targetIds.sort((a, b) => depthOf(a) - depthOf(b));

  const rows = await context.store.list();
  const mappings = byLocation(rows);
  const pending = targetIds.filter((id) => {
    const row = mappings.get(id);
    return !(row && row.status === 'ready');
  });

  const batch = pending.slice(0, input.batchSize);
  const failed: { locationId: string; error: string }[] = [];
  let created = 0;
  for (const id of batch) {
    try {
      await ensureLocationFolder(context, id);
      created += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'folder_create_failed';
      failed.push({ locationId: id, error: message });
      const row = byLocation(await context.store.list()).get(id);
      if (row) await context.store.update(row.id, { status: 'error', lastError: message.slice(0, 500) });
    }
  }
  const failedIds = new Set(failed.map((item) => item.locationId));
  return {
    processed: batch.length,
    created,
    failed,
    remaining: pending.length - batch.length + failedIds.size,
  };
}

/**
 * Applies a renamed location to its provider folder. Folders the customer linked by hand
 * (origin = linked_existing) keep their own name; the mapping is untouched either way.
 */
export async function renameLocationFolder(context: FolderContext, locationId: string): Promise<'renamed' | 'unchanged' | 'no_folder'> {
  const rows = await context.store.list();
  const row = byLocation(rows).get(locationId);
  if (!row || row.status !== 'ready') return 'no_folder';
  if (row.origin === 'linked_existing') return 'unchanged';
  const node = context.tree.find((candidate) => candidate.id === locationId);
  if (!node) throw new NotFoundError('Location');
  const names = siblingFolderNames(rows, context.tree, node.parentId, node.id);
  const desired = uniqueFolderName(infraFolderNameForLocation(node), names);
  if (desired === row.displayName) return 'unchanged';
  const renamed = await context.adapter.renameFolder(row.externalFolderId, desired);
  await context.store.update(row.id, {
    externalFolderId: renamed.id,
    displayName: renamed.name,
    status: 'ready',
    lastError: null,
    lastVerifiedAt: new Date(),
  });
  return 'renamed';
}

/**
 * Applies a moved location: its provider folder (with everything inside, so every photo keeps its
 * folder link) moves under the new parent location's folder. Linked (customer-picked) folders stay
 * where the customer put them - only the hierarchy in the app changes.
 */
export async function moveLocationFolder(context: FolderContext, locationId: string): Promise<'moved' | 'unchanged' | 'no_folder'> {
  const rows = await context.store.list();
  const row = byLocation(rows).get(locationId);
  if (!row || row.status !== 'ready') return 'no_folder';
  if (row.origin === 'linked_existing') return 'unchanged';
  const chain = chainFor(context.tree, locationId);
  const parentLocationId = chain.length > 1 ? chain[chain.length - 2]!.id : null;

  const newParentFolderId = parentLocationId
    ? await ensureLocationFolder(context, parentLocationId)
    : (await ensureInfraRoot(context)).externalFolderId;
  if (row.externalParentId === newParentFolderId) return 'unchanged';

  const node = chain[chain.length - 1]!;
  const fresh = await context.store.list();
  const desired = uniqueFolderName(infraFolderNameForLocation(node), siblingFolderNames(fresh, context.tree, parentLocationId, node.id));
  const moved = await context.adapter.moveFolder(row.externalFolderId, newParentFolderId);
  let displayName = moved.name;
  if (moved.name !== desired) {
    const renamed = await context.adapter.renameFolder(moved.id, desired);
    displayName = renamed.name;
  }
  await context.store.update(row.id, {
    externalFolderId: moved.id,
    externalParentId: newParentFolderId,
    displayName,
    status: 'ready',
    lastError: null,
    lastVerifiedAt: new Date(),
  });
  return 'moved';
}

/**
 * Links a folder the customer already has (picked in the storage browser) to a location - or to the
 * project's infrastructure root when `locationId` is null. One provider folder serves one location.
 */
export async function linkExistingFolder(
  context: FolderContext,
  input: { readonly locationId: string | null; readonly externalFolderId: string },
): Promise<FolderMappingRow> {
  if (input.locationId && !context.tree.some((node) => node.id === input.locationId)) {
    throw new NotFoundError('Location');
  }
  const folder = await context.adapter.getFolder(input.externalFolderId);
  if (!folder) throw new NotFoundError('Folder');

  const rows = await context.store.list();
  const clash = rows.find((row) => row.externalFolderId === folder.id && row.locationId !== input.locationId);
  if (clash) {
    throw new ConflictError('Folder already serves another location', 'infraMapping.errors.folderInUse');
  }
  const existing = byLocation(rows).get(input.locationId);
  if (existing) {
    await context.store.update(existing.id, {
      externalFolderId: folder.id,
      externalParentId: folder.parentId,
      displayName: folder.name,
      origin: 'linked_existing',
      status: 'ready',
      lastError: null,
      lastVerifiedAt: new Date(),
    });
    return { ...existing, externalFolderId: folder.id, origin: 'linked_existing', status: 'ready' };
  }
  return context.store.insert({
    locationId: input.locationId,
    externalFolderId: folder.id,
    externalParentId: folder.parentId,
    displayName: folder.name,
    origin: 'linked_existing',
    status: 'ready',
    lastError: null,
  });
}

/** Used by the upload path: a location folder id, or null when folders cannot be resolved. */
export async function tryEnsureLocationFolder(context: FolderContext, locationId: string): Promise<string | null> {
  try {
    return await ensureLocationFolder(context, locationId);
  } catch (error) {
    if (error instanceof DomainRuleError || error instanceof NotFoundError) throw error;
    return null;
  }
}

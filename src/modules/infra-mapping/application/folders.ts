import { ConflictError, DomainRuleError, NotFoundError } from '@/shared/errors';
import type { FolderMappingRow } from '../data/infra.repository';
import { subtreeIds } from '../domain/filters';
import { INFRA_ROOT_FOLDER_NAME, infraFolderNameForLocation, uniqueFolderName } from '../domain/folder-naming';
import { FOLDER_MISSING, placementOf, type PlacementNode, type PlacementSegment } from '../domain/folder-placement';

/**
 * Real cloud-folder operations for the infrastructure tree, created LAZILY.
 *
 * Locations are virtual: creating a structure only writes `project_locations` rows. A folder appears in the
 * customer's cloud the first time something is uploaded to a location (or when the user explicitly asks), and
 * only the needed chain is created - never the whole tree. Where a location's folder sits is decided by the pure
 * `placementOf` (levels and rooms are metadata, one folder per unit).
 *
 * The mapping (infra_folder_mappings: location <-> provider folder id) is keyed by the provider folder id, so a
 * rename or move done directly in the cloud never produces a duplicate. A folder that is gone is reported
 * (status `error` + `folder_missing`), never silently replaced.
 *
 * Provider-agnostic and DB-agnostic: talks to a narrow adapter and a mapping store, so it is unit-testable.
 */

export { FOLDER_MISSING };

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
  /**
   * The project's own folder in the cloud (the infrastructure root lives directly under it). Lazy: it is only
   * called when a folder really has to be created, so an upload into an existing folder makes no provider call.
   */
  readonly getProjectFolderId: () => Promise<string>;
  /** Whole location tree of the project (archived included). */
  readonly tree: readonly PlacementNode[];
}

function missingError(): DomainRuleError {
  return new DomainRuleError('The cloud folder was removed or moved away', 'infraMapping.errors.folderMissing');
}

/** The provider folder id of a usable mapping; throws when it is flagged missing; null when it must be (re)created. */
function readyFolderId(row: FolderMappingRow | undefined): string | null {
  if (!row) return null;
  if (row.status === 'ready' && row.externalFolderId && !row.externalFolderId.startsWith('pending')) {
    return row.externalFolderId;
  }
  if (row.status === 'error' && row.lastError === FOLDER_MISSING) throw missingError();
  return null;
}

async function resolveOrCreateChild(adapter: FolderAdapter, parentId: string, name: string): Promise<FolderItem> {
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

/** One resolution session: mapping rows are read once and kept in step with every write. */
class Resolver {
  private loaded: FolderMappingRow[] | null = null;
  private readonly groups = new Map<string, string>();
  /** Location being moved: its (stale) folder must not be used to find the group it is moving INTO. */
  private excluded: string | null = null;

  constructor(readonly context: FolderContext) {}

  async rows(): Promise<FolderMappingRow[]> {
    if (!this.loaded) this.loaded = [...(await this.context.store.list())];
    return this.loaded;
  }

  private remember(row: FolderMappingRow): void {
    const rows = this.loaded ?? [];
    const index = rows.findIndex((item) => item.id === row.id);
    if (index >= 0) rows[index] = row;
    else rows.push(row);
    this.loaded = rows;
  }

  forget(mappingId: string): void {
    if (this.loaded) this.loaded = this.loaded.filter((row) => row.id !== mappingId);
  }

  node(locationId: string): PlacementNode {
    const found = this.context.tree.find((node) => node.id === locationId);
    if (!found) throw new NotFoundError('Location');
    return found;
  }

  async ownRow(locationId: string | null): Promise<FolderMappingRow | undefined> {
    return (await this.rows()).find((row) => row.locationId === locationId);
  }

  async namesUnder(parentFolderId: string, exceptMappingId: string | null): Promise<Set<string>> {
    const names = new Set<string>();
    for (const row of await this.rows()) {
      if (row.externalParentId === parentFolderId && row.id !== exceptMappingId) names.add(row.displayName);
    }
    return names;
  }

  async save(
    existing: FolderMappingRow | undefined,
    data: { locationId: string | null; folder: FolderItem; parentFolderId: string | null },
  ): Promise<FolderMappingRow> {
    const base = {
      externalFolderId: data.folder.id,
      externalParentId: data.parentFolderId,
      displayName: data.folder.name,
      status: 'ready' as const,
      lastError: null,
    };
    if (existing) {
      await this.context.store.update(existing.id, { ...base, origin: 'auto', lastVerifiedAt: new Date() });
      const updated: FolderMappingRow = { ...existing, ...base, origin: 'auto' };
      this.remember(updated);
      return updated;
    }
    const inserted = await this.context.store.insert({ locationId: data.locationId, origin: 'auto', ...base });
    this.remember(inserted);
    return inserted;
  }

  async infraRoot(): Promise<string> {
    const existing = await this.ownRow(null);
    const ready = readyFolderId(existing);
    if (ready) return ready;
    const projectFolderId = await this.context.getProjectFolderId();
    const folder = await resolveOrCreateChild(this.context.adapter, projectFolderId, INFRA_ROOT_FOLDER_NAME);
    await this.save(existing, { locationId: null, folder, parentFolderId: projectFolderId });
    return folder.id;
  }

  /** The folder a location's files go to; creates only the missing part of its chain. */
  async ensure(locationId: string, depth = 0): Promise<string> {
    if (depth > 40) throw new DomainRuleError('Location chain too deep', 'infraMapping.errors.projectFolder');
    const node = this.node(locationId);
    const own = await this.ownRow(locationId);
    const ready = readyFolderId(own);
    if (ready) return ready;

    const placement = placementOf(this.context.tree, locationId);
    if (!placement) throw new NotFoundError('Location');
    if (!own && placement.anchorId !== locationId) return this.ensure(placement.anchorId, depth + 1);

    const parentFolderId =
      placement.anchorId === locationId
        ? await this.parentFolder(placement.segments, placement.segments.length - 1, depth)
        : node.parentId
          ? await this.ensure(node.parentId, depth + 1)
          : await this.infraRoot();
    const name = uniqueFolderName(infraFolderNameForLocation(node), await this.namesUnder(parentFolderId, own?.id ?? null));
    const folder = await resolveOrCreateChild(this.context.adapter, parentFolderId, name);
    await this.save(own, { locationId, folder, parentFolderId });
    return folder.id;
  }

  /** Folder id of the segment just before `index` (the infrastructure root when there is none). */
  private async parentFolder(segments: readonly PlacementSegment[], index: number, depth: number): Promise<string> {
    const previous = segments[index - 1];
    if (!previous) return this.infraRoot();
    if (previous.kind === 'location') return this.ensure(previous.locationId, depth + 1);
    return this.groupFolder(segments, index - 1, depth);
  }

  /**
   * A grouping folder ("יחידות" / "שטחים משותפים"). There is no table for it, so it is found through its
   * children (their parent folder id - robust to a rename in the cloud) and only then by name, creating it once.
   */
  private async groupFolder(segments: readonly PlacementSegment[], index: number, depth: number): Promise<string> {
    const segment = segments[index];
    if (!segment || segment.kind !== 'group') throw new NotFoundError('Folder');
    const cached = this.groups.get(segment.key);
    if (cached) return cached;

    const rows = await this.rows();
    const folderIds = new Set(rows.map((row) => row.externalFolderId));
    for (const row of rows) {
      if (!row.locationId || row.locationId === this.excluded || row.status !== 'ready' || !row.externalParentId) continue;
      if (folderIds.has(row.externalParentId)) continue; // legacy: nested under another location's folder
      const placement = placementOf(this.context.tree, row.locationId);
      if (!placement || placement.anchorId !== row.locationId) continue;
      const own = placement.segments[placement.segments.length - 2];
      if (own && own.kind === 'group' && own.key === segment.key) {
        this.groups.set(segment.key, row.externalParentId);
        return row.externalParentId;
      }
    }
    const parentFolderId = await this.parentFolder(segments, index, depth);
    const folder = await resolveOrCreateChild(this.context.adapter, parentFolderId, segment.name);
    this.groups.set(segment.key, folder.id);
    return folder.id;
  }

  /** Folder id a location's own folder SHOULD sit in, without creating anything that is already there. */
  async expectedParentFolder(locationId: string): Promise<string | null> {
    const placement = placementOf(this.context.tree, locationId);
    if (!placement || placement.anchorId !== locationId) return null;
    this.excluded = locationId;
    try {
      return await this.parentFolder(placement.segments, placement.segments.length - 1, 0);
    } finally {
      this.excluded = null;
    }
  }
}

/** The project's infrastructure root folder (created on first use). */
export async function ensureInfraRootFolder(context: FolderContext): Promise<string> {
  return new Resolver(context).infraRoot();
}

/**
 * Returns the provider folder id of `locationId`, creating only the missing part of its chain (never a folder
 * for a level or a room). Idempotent: running it twice creates nothing the second time. A folder flagged as
 * missing is NOT silently replaced - it throws `infraMapping.errors.folderMissing`.
 */
export async function ensureLocationFolder(context: FolderContext, locationId: string): Promise<string> {
  return new Resolver(context).ensure(locationId);
}

export interface SyncResult {
  /** Locations handled in this call. */
  readonly processed: number;
  readonly created: number;
  readonly failed: readonly { readonly locationId: string; readonly error: string }[];
  /** Locations of the target set still waiting (call again until 0). */
  readonly remaining: number;
}

/**
 * Explicit folder creation / repair in paced batches (the caller loops until `remaining` is 0).
 *  - `locationIds` given: the user asked for real folders for these locations and everything below them. Only
 *    folders that are actually needed (units, spaces, buildings) are created - never one per level or room.
 *  - no ids: REPAIR only. Mappings whose creation failed are retried; a folder that disappeared from the cloud
 *    is left for the user to decide (relink or create again).
 */
export async function syncLocationFolders(
  context: FolderContext,
  input: { readonly locationIds?: readonly string[] | null; readonly batchSize: number },
): Promise<SyncResult> {
  const resolver = new Resolver(context);
  const before = (await resolver.rows()).length;
  const failed: { locationId: string; error: string }[] = [];
  let pendingIds: string[];

  if (input.locationIds && input.locationIds.length > 0) {
    const active = context.tree.filter((node) => !node.archived);
    const anchors = new Set<string>();
    const rows = await resolver.rows();
    const ready = new Set(rows.filter((row) => row.status === 'ready' && row.locationId).map((row) => row.locationId!));
    for (const rootId of input.locationIds) {
      for (const id of subtreeIds(active, rootId)) {
        if (ready.has(id)) continue;
        const placement = placementOf(context.tree, id);
        if (!placement || ready.has(placement.anchorId)) continue;
        anchors.add(placement.anchorId);
      }
    }
    const depthOf = (id: string) => {
      let depth = 0;
      let cursor = context.tree.find((node) => node.id === id);
      while (cursor?.parentId && depth < 40) {
        depth += 1;
        cursor = context.tree.find((node) => node.id === cursor!.parentId);
      }
      return depth;
    };
    pendingIds = [...anchors].sort((a, b) => depthOf(a) - depthOf(b));
  } else {
    pendingIds = (await resolver.rows())
      .filter((row) => row.locationId && row.status !== 'ready' && row.lastError !== FOLDER_MISSING)
      .map((row) => row.locationId!);
  }

  const batch = pendingIds.slice(0, input.batchSize);
  for (const id of batch) {
    try {
      await resolver.ensure(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'folder_create_failed';
      failed.push({ locationId: id, error: message });
      const row = await resolver.ownRow(id);
      if (row && row.status !== 'ready') await context.store.update(row.id, { status: 'error', lastError: message.slice(0, 500) });
    }
  }
  const after = (await resolver.rows()).length;
  return {
    processed: batch.length,
    created: Math.max(0, after - before),
    failed,
    remaining: pendingIds.length - batch.length + failed.length,
  };
}

/**
 * Applies a renamed location (or a new unit number) to its provider folder, by the folder id. Folders the
 * customer linked by hand keep their own name. Nothing is created or deleted: files stay where they are.
 */
export async function renameLocationFolder(context: FolderContext, locationId: string): Promise<'renamed' | 'unchanged' | 'no_folder'> {
  const resolver = new Resolver(context);
  const row = await resolver.ownRow(locationId);
  if (!row || row.status !== 'ready') return 'no_folder';
  if (row.origin === 'linked_existing') return 'unchanged';
  const node = resolver.node(locationId);
  const taken = await resolver.namesUnder(row.externalParentId ?? '', row.id);
  const desired = uniqueFolderName(infraFolderNameForLocation(node), taken);
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
 * Applies a moved location. Moving a unit between levels of its building changes nothing in the cloud (levels
 * are not folders). The provider folder - with every photo inside - only moves when the location leaves its
 * container (for example another building); folders of older projects (nested under floor folders) and
 * folders linked by hand stay where they are.
 */
export async function moveLocationFolder(context: FolderContext, locationId: string): Promise<'moved' | 'unchanged' | 'no_folder'> {
  const resolver = new Resolver(context);
  const row = await resolver.ownRow(locationId);
  if (!row || row.status !== 'ready') return 'no_folder';
  if (row.origin === 'linked_existing') return 'unchanged';

  const rows = await resolver.rows();
  const parentRow = rows.find((item) => item.externalFolderId === row.externalParentId);
  const parentNode = parentRow?.locationId ? context.tree.find((node) => node.id === parentRow.locationId) : undefined;
  if (parentNode && (parentNode.type === 'floor' || parentNode.type === 'basement')) return 'unchanged'; // older layout

  const expectedParent = await resolver.expectedParentFolder(locationId);
  if (!expectedParent || row.externalParentId === expectedParent) return 'unchanged';

  const node = resolver.node(locationId);
  const desired = uniqueFolderName(infraFolderNameForLocation(node), await resolver.namesUnder(expectedParent, row.id));
  const moved = await context.adapter.moveFolder(row.externalFolderId, expectedParent);
  let displayName = moved.name;
  if (moved.name !== desired) {
    const renamed = await context.adapter.renameFolder(moved.id, desired);
    displayName = renamed.name;
  }
  await context.store.update(row.id, {
    externalFolderId: moved.id,
    externalParentId: expectedParent,
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
  const existing = rows.find((row) => row.locationId === input.locationId);
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
    return { ...existing, externalFolderId: folder.id, origin: 'linked_existing', status: 'ready', lastError: null };
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

// ── controlled drift detection (one folder, on demand - never a background scan) ──────────────────

export type FolderInspection =
  /** No folder yet: the location is virtual (this is fine, the folder is created on the first upload). */
  | { readonly state: 'virtual' }
  | { readonly state: 'ok'; readonly folderName: string }
  /** The folder was renamed directly in the cloud. */
  | { readonly state: 'renamed_outside'; readonly cloudName: string; readonly systemName: string }
  /** The folder was deleted or moved out of reach: the link needs repair. */
  | { readonly state: 'missing' };

/** Checks the known folder of one location by its provider id (not by name). */
export async function inspectLocationFolder(context: FolderContext, locationId: string): Promise<FolderInspection> {
  const resolver = new Resolver(context);
  const row = await resolver.ownRow(locationId);
  if (!row) return { state: 'virtual' };
  if (row.status === 'error' && row.lastError === FOLDER_MISSING) return { state: 'missing' };
  if (row.status !== 'ready') return { state: 'virtual' };
  const folder = await context.adapter.getFolder(row.externalFolderId);
  if (!folder) {
    await context.store.update(row.id, { status: 'error', lastError: FOLDER_MISSING, lastVerifiedAt: new Date() });
    return { state: 'missing' };
  }
  if (folder.name !== row.displayName) {
    return { state: 'renamed_outside', cloudName: folder.name, systemName: row.displayName };
  }
  await context.store.update(row.id, { lastVerifiedAt: new Date() });
  return { state: 'ok', folderName: folder.name };
}

export type DriftChoice = 'adopt_cloud_name' | 'restore_name';

/**
 * Settles a folder renamed in the cloud: either the system takes the cloud name over as the folder's name, or
 * the cloud folder is renamed back to the system name. The location itself (its official number / name) is never
 * changed by this - only the folder.
 */
export async function resolveFolderDrift(
  context: FolderContext,
  input: { readonly locationId: string; readonly choice: DriftChoice },
): Promise<'adopted' | 'restored' | 'unchanged'> {
  const resolver = new Resolver(context);
  const row = await resolver.ownRow(input.locationId);
  if (!row || row.status !== 'ready') return 'unchanged';
  if (input.choice === 'adopt_cloud_name') {
    const folder = await context.adapter.getFolder(row.externalFolderId);
    if (!folder) {
      await context.store.update(row.id, { status: 'error', lastError: FOLDER_MISSING });
      throw missingError();
    }
    await context.store.update(row.id, { displayName: folder.name, lastVerifiedAt: new Date() });
    return 'adopted';
  }
  const node = resolver.node(input.locationId);
  const desired = uniqueFolderName(infraFolderNameForLocation(node), await resolver.namesUnder(row.externalParentId ?? '', row.id));
  const renamed = await context.adapter.renameFolder(row.externalFolderId, desired);
  await context.store.update(row.id, { displayName: renamed.name, lastVerifiedAt: new Date() });
  return 'restored';
}

/**
 * A folder that disappeared is only replaced on the user's explicit request: the old mapping is dropped and a
 * fresh folder is created lazily. Nothing in the cloud is deleted; files already uploaded keep their own links.
 */
export async function recreateMissingFolder(context: FolderContext, locationId: string): Promise<string> {
  const resolver = new Resolver(context);
  const row = await resolver.ownRow(locationId);
  if (row && row.status === 'error' && row.lastError === FOLDER_MISSING) {
    await context.store.remove(row.id);
    resolver.forget(row.id);
  }
  return resolver.ensure(locationId);
}

export function isFolderMissingFlag(row: { status: string; lastError: string | null }): boolean {
  return row.status === 'error' && row.lastError === FOLDER_MISSING;
}

/**
 * Lazy folder service against an in-memory provider tree and mapping store (no database, no network - the real
 * cloud providers are NOT exercised here). Proves: creating a structure makes no folders, the first upload
 * creates only the needed chain, later uploads reuse it, levels / rooms never get folders, rename / move keep the
 * photo<->folder link, renames done in the cloud are detected on demand, and a deleted folder is never silently
 * replaced.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FOLDER_MISSING,
  ensureInfraRootFolder,
  ensureLocationFolder,
  inspectLocationFolder,
  linkExistingFolder,
  moveLocationFolder,
  recreateMissingFolder,
  renameLocationFolder,
  resolveFolderDrift,
  syncLocationFolders,
  type FolderAdapter,
  type FolderContext,
  type FolderItem,
  type FolderMappingStore,
} from '@/modules/infra-mapping/application/folders';
import type { FolderMappingRow } from '@/modules/infra-mapping/data/infra.repository';
import type { PlacementNode } from '@/modules/infra-mapping/domain/folder-placement';

type Node = PlacementNode & { code: string | null };

class FakeProvider implements FolderAdapter {
  folders = new Map<string, FolderItem>();
  created = 0;
  failCreateFor = new Set<string>();
  private seq = 0;

  seed(name: string, parentId: string | null): FolderItem {
    const folder = { id: `f${++this.seq}`, name, parentId };
    this.folders.set(folder.id, folder);
    return folder;
  }
  async getFolder(folderId: string) {
    return this.folders.get(folderId) ?? null;
  }
  async findChildByName(parentId: string, name: string) {
    return [...this.folders.values()].find((f) => f.parentId === parentId && f.name === name) ?? null;
  }
  async createFolder(input: { name: string; parentId: string }) {
    if (this.failCreateFor.has(input.name)) throw new Error(`provider rejected ${input.name}`);
    this.created += 1;
    return this.seed(input.name, input.parentId);
  }
  async renameFolder(folderId: string, name: string) {
    const folder = { ...this.folders.get(folderId)!, name };
    this.folders.set(folderId, folder);
    return folder;
  }
  async moveFolder(folderId: string, newParentId: string) {
    const folder = { ...this.folders.get(folderId)!, parentId: newParentId };
    this.folders.set(folderId, folder);
    return folder;
  }
  pathOf(folderId: string): string {
    const parts: string[] = [];
    let cursor = this.folders.get(folderId);
    while (cursor) {
      parts.unshift(cursor.name);
      cursor = cursor.parentId ? this.folders.get(cursor.parentId) : undefined;
    }
    return parts.join('/');
  }
  namesAnywhere(): string[] {
    return [...this.folders.values()].map((f) => f.name);
  }
}

class FakeStore implements FolderMappingStore {
  rows: FolderMappingRow[] = [];
  private seq = 0;
  async list() {
    return this.rows.map((row) => ({ ...row }));
  }
  async insert(row: Parameters<FolderMappingStore['insert']>[0]) {
    const created = { id: `m${++this.seq}`, ...row } as unknown as FolderMappingRow;
    this.rows.push(created);
    return { ...created };
  }
  async update(mappingId: string, patch: Parameters<FolderMappingStore['update']>[1]) {
    this.rows = this.rows.map((row) => (row.id === mappingId ? ({ ...row, ...patch } as FolderMappingRow) : row));
  }
  async remove(mappingId: string) {
    this.rows = this.rows.filter((row) => row.id !== mappingId);
  }
  forLocation(locationId: string | null) {
    return this.rows.find((row) => row.locationId === locationId);
  }
}

const ROOT = 'פרויקט א/תיעוד תשתיות';

describe('lazy infrastructure folders in the customer cloud', () => {
  let provider: FakeProvider;
  let store: FakeStore;
  let projectFolder: FolderItem;
  let tree: Node[];
  let projectFolderCalls: number;
  const context = (): FolderContext => ({
    adapter: provider,
    store,
    tree,
    getProjectFolderId: async () => {
      projectFolderCalls += 1;
      return projectFolder.id;
    },
  });

  beforeEach(() => {
    provider = new FakeProvider();
    store = new FakeStore();
    projectFolder = provider.seed('פרויקט א', null);
    projectFolderCalls = 0;
    tree = [
      { id: 'bldA', parentId: null, name: 'בניין א', code: null, type: 'building' },
      { id: 'fl3', parentId: 'bldA', name: 'קומה 3', code: null, type: 'floor' },
      { id: 'fl4', parentId: 'bldA', name: 'קומה 4', code: null, type: 'floor' },
      { id: 'ap12', parentId: 'fl3', name: 'דירה 12', code: null, type: 'apartment' },
      { id: 'ap13', parentId: 'fl3', name: 'דירה 13', code: null, type: 'apartment' },
      { id: 'room1', parentId: 'ap12', name: 'סלון', code: null, type: 'room' },
      { id: 'lobby', parentId: 'bldA', name: 'לובי', code: null, type: 'area' },
      { id: 'bldB', parentId: null, name: 'בניין ב', code: null, type: 'building' },
    ];
  });

  it('a large structure creates no folders and no provider calls by itself', async () => {
    for (let i = 0; i < 300; i += 1) {
      tree.push({ id: `bulk${i}`, parentId: 'fl4', name: `דירה ${100 + i}`, code: null, type: 'apartment' });
    }
    // Nothing runs on creation; a repair pass over an untouched structure finds nothing to do.
    const result = await syncLocationFolders(context(), { batchSize: 40 });
    expect(result).toMatchObject({ processed: 0, created: 0, remaining: 0 });
    expect(provider.created).toBe(0);
    expect(projectFolderCalls).toBe(0);
    expect(store.rows).toHaveLength(0);
  });

  it('the first upload creates only the needed chain (no level, no room, no sibling units)', async () => {
    const folderId = await ensureLocationFolder(context(), 'ap12');
    expect(provider.pathOf(folderId)).toBe(`${ROOT}/בניין א/יחידות/דירה 12`);
    expect(provider.created).toBe(4); // infra root, building, units group, unit
    expect(provider.namesAnywhere()).not.toContain('קומה 3');
    expect(provider.namesAnywhere()).not.toContain('סלון');
    expect(provider.namesAnywhere()).not.toContain('דירה 13');
    expect(store.forLocation(null)?.status).toBe('ready');
    expect(store.forLocation('bldA')?.status).toBe('ready');
    expect(store.forLocation('ap12')?.externalFolderId).toBe(folderId);
  });

  it('the second upload reuses the saved folder and makes no provider call at all', async () => {
    const first = await ensureLocationFolder(context(), 'ap12');
    const created = provider.created;
    const calls = projectFolderCalls;
    const second = await ensureLocationFolder(context(), 'ap12');
    expect(second).toBe(first);
    expect(provider.created).toBe(created);
    expect(projectFolderCalls).toBe(calls);
  });

  it('another unit reuses the building and the units group - only its own folder is created', async () => {
    await ensureLocationFolder(context(), 'ap12');
    const before = provider.created;
    const other = await ensureLocationFolder(context(), 'ap13');
    expect(provider.created).toBe(before + 1);
    expect(provider.pathOf(other)).toBe(`${ROOT}/בניין א/יחידות/דירה 13`);
    expect(provider.namesAnywhere().filter((name) => name === 'יחידות')).toHaveLength(1);
  });

  it('a level and a room resolve to the existing folder and never create their own', async () => {
    const unit = await ensureLocationFolder(context(), 'ap12');
    const before = provider.created;
    expect(await ensureLocationFolder(context(), 'room1')).toBe(unit);
    expect(provider.created).toBe(before);
    const building = store.forLocation('bldA')!.externalFolderId;
    expect(await ensureLocationFolder(context(), 'fl3')).toBe(building);
    expect(provider.created).toBe(before);
  });

  it('common areas go under a "שטחים משותפים" group only when used', async () => {
    const folderId = await ensureLocationFolder(context(), 'lobby');
    expect(provider.pathOf(folderId)).toBe(`${ROOT}/בניין א/שטחים משותפים/לובי`);
    expect(provider.namesAnywhere()).not.toContain('יחידות');
  });

  it('a private house has no "יחידות" folder and keeps its rooms inside it', async () => {
    tree.push(
      { id: 'villa', parentId: null, name: 'וילה 1', code: null, type: 'building', structure: 'house' },
      { id: 'kitchen', parentId: 'villa', name: 'מטבח', code: null, type: 'room' },
    );
    const villa = await ensureLocationFolder(context(), 'villa');
    expect(provider.pathOf(villa)).toBe(`${ROOT}/וילה 1`);
    expect(await ensureLocationFolder(context(), 'kitchen')).toBe(villa);
    expect(provider.namesAnywhere()).not.toContain('יחידות');
  });

  it('an infrastructure project without buildings mirrors its areas', async () => {
    tree.push(
      { id: 'road', parentId: null, name: 'כביש 1', code: null, type: 'area' },
      { id: 'seg', parentId: 'road', name: 'קטע 1', code: null, type: 'area' },
    );
    const folderId = await ensureLocationFolder(context(), 'seg');
    expect(provider.pathOf(folderId)).toBe(`${ROOT}/כביש 1/קטע 1`);
  });

  it('the project folder is only asked for when something really has to be created', async () => {
    await ensureInfraRootFolder(context());
    expect(projectFolderCalls).toBe(1);
    await ensureInfraRootFolder(context());
    expect(projectFolderCalls).toBe(1);
  });

  it('explicit creation for a building makes real folders only for units / areas, not for levels or rooms', async () => {
    const result = await syncLocationFolders(context(), { locationIds: ['bldA'], batchSize: 40 });
    expect(result.remaining).toBe(0);
    expect(result.failed).toEqual([]);
    const names = provider.namesAnywhere();
    expect(names).toEqual(expect.arrayContaining(['בניין א', 'דירה 12', 'דירה 13', 'לובי']));
    expect(names).not.toContain('קומה 3');
    expect(names).not.toContain('קומה 4');
    expect(names).not.toContain('סלון');
    const again = await syncLocationFolders(context(), { locationIds: ['bldA'], batchSize: 40 });
    expect(again).toMatchObject({ processed: 0, remaining: 0 });
  });

  it('archived locations are not created by an explicit branch creation', async () => {
    tree = tree.map((node) => (node.id === 'ap13' ? { ...node, archived: true } : node));
    await syncLocationFolders(context(), { locationIds: ['bldA'], batchSize: 40 });
    expect(provider.namesAnywhere()).not.toContain('דירה 13');
  });

  it('a failing creation is reported and retried, never silently dropped', async () => {
    provider.failCreateFor.add('דירה 12');
    const first = await syncLocationFolders(context(), { locationIds: ['ap12'], batchSize: 20 });
    expect(first.failed.map((item) => item.locationId)).toEqual(['ap12']);
    expect(first.remaining).toBe(1);
    provider.failCreateFor.clear();
    const second = await syncLocationFolders(context(), { locationIds: ['ap12'], batchSize: 20 });
    expect(second.remaining).toBe(0);
    expect(store.forLocation('ap12')?.status).toBe('ready');
  });

  it('repair (no ids) retries failed rows only and leaves a missing folder for the user to decide', async () => {
    const a = await ensureLocationFolder(context(), 'ap12');
    const b = await ensureLocationFolder(context(), 'ap13');
    provider.folders.delete(a);
    await inspectLocationFolder(context(), 'ap12'); // flags it as missing
    const brokenRow = store.forLocation('ap13')!;
    await store.update(brokenRow.id, { status: 'error', lastError: 'boom' });
    const before = provider.created;
    const result = await syncLocationFolders(context(), { batchSize: 20 });
    expect(result.remaining).toBe(0);
    expect(store.forLocation('ap13')?.externalFolderId).toBe(b);
    expect(store.forLocation('ap12')?.lastError).toBe(FOLDER_MISSING); // untouched
    expect(provider.created).toBe(before);
  });

  it('two sibling units with the same name get distinct folders', async () => {
    tree.push({ id: 'dup1', parentId: 'fl4', name: 'חנות', code: null, type: 'apartment' }, { id: 'dup2', parentId: 'fl4', name: 'חנות', code: null, type: 'apartment' });
    const a = await ensureLocationFolder(context(), 'dup1');
    const b = await ensureLocationFolder(context(), 'dup2');
    expect(a).not.toBe(b);
    expect(provider.pathOf(b)).toMatch(/חנות \(2\)$/);
  });

  it('renaming a unit renames its folder but keeps the folder id (photos stay linked)', async () => {
    const folderId = await ensureLocationFolder(context(), 'ap12');
    tree = tree.map((node) => (node.id === 'ap12' ? { ...node, name: 'דירה 12א' } : node));
    expect(await renameLocationFolder(context(), 'ap12')).toBe('renamed');
    expect(store.forLocation('ap12')?.externalFolderId).toBe(folderId);
    expect(provider.pathOf(folderId)).toMatch(/דירה 12א$/);
    expect(await renameLocationFolder(context(), 'ap12')).toBe('unchanged');
  });

  it('moving a unit to another level changes nothing in the cloud; to another building it moves the folder with its content', async () => {
    const unit = await ensureLocationFolder(context(), 'ap12');
    const marker = provider.seed('content', unit);
    tree = tree.map((node) => (node.id === 'ap12' ? { ...node, parentId: 'fl4' } : node));
    expect(await moveLocationFolder(context(), 'ap12')).toBe('unchanged');
    expect(provider.pathOf(unit)).toBe(`${ROOT}/בניין א/יחידות/דירה 12`);

    tree = [
      ...tree.map((node) => (node.id === 'ap12' ? { ...node, parentId: 'bldB' } : node)),
    ];
    expect(await moveLocationFolder(context(), 'ap12')).toBe('moved');
    expect(store.forLocation('ap12')?.externalFolderId).toBe(unit);
    expect(provider.pathOf(unit)).toBe(`${ROOT}/בניין ב/יחידות/דירה 12`);
    expect(provider.folders.get(marker.id)?.parentId).toBe(unit);
  });

  it('a location without a folder yet is reported, not invented, by rename / move', async () => {
    expect(await renameLocationFolder(context(), 'ap12')).toBe('no_folder');
    expect(await moveLocationFolder(context(), 'ap12')).toBe('no_folder');
    expect(provider.created).toBe(0);
  });

  it('links a folder the customer already has and keeps its own name', async () => {
    const existing = provider.seed('התיקייה הישנה של דירה 12', projectFolder.id);
    const row = await linkExistingFolder(context(), { locationId: 'ap12', externalFolderId: existing.id });
    expect(row.origin).toBe('linked_existing');
    tree = tree.map((node) => (node.id === 'ap12' ? { ...node, name: 'דירה 12 (שונה)' } : node));
    expect(await renameLocationFolder(context(), 'ap12')).toBe('unchanged');
    expect(provider.folders.get(existing.id)?.name).toBe('התיקייה הישנה של דירה 12');
    expect(await ensureLocationFolder(context(), 'ap12')).toBe(existing.id);
  });

  it('one provider folder cannot serve two locations; a missing folder or unknown location fails clearly', async () => {
    const existing = provider.seed('משותפת', projectFolder.id);
    await linkExistingFolder(context(), { locationId: 'bldA', externalFolderId: existing.id });
    await expect(linkExistingFolder(context(), { locationId: 'bldB', externalFolderId: existing.id })).rejects.toMatchObject({
      messageKey: 'infraMapping.errors.folderInUse',
    });
    await expect(linkExistingFolder(context(), { locationId: 'bldB', externalFolderId: 'nope' })).rejects.toThrow();
    await expect(linkExistingFolder(context(), { locationId: 'ghost', externalFolderId: existing.id })).rejects.toThrow();
  });

  it('a folder renamed in the cloud is detected on demand; the user adopts the name or restores it; the unit is untouched', async () => {
    const folderId = await ensureLocationFolder(context(), 'ap12');
    await provider.renameFolder(folderId, 'דירה של הלקוח');
    const inspected = await inspectLocationFolder(context(), 'ap12');
    expect(inspected).toEqual({ state: 'renamed_outside', cloudName: 'דירה של הלקוח', systemName: 'דירה 12' });

    expect(await resolveFolderDrift(context(), { locationId: 'ap12', choice: 'adopt_cloud_name' })).toBe('adopted');
    expect(store.forLocation('ap12')?.displayName).toBe('דירה של הלקוח');
    expect(tree.find((node) => node.id === 'ap12')?.name).toBe('דירה 12');
    expect(store.forLocation('ap12')?.externalFolderId).toBe(folderId);
    expect(await inspectLocationFolder(context(), 'ap12')).toMatchObject({ state: 'ok' });

    await provider.renameFolder(folderId, 'שם אחר');
    await resolveFolderDrift(context(), { locationId: 'ap12', choice: 'restore_name' });
    expect(provider.folders.get(folderId)?.name).toBe('דירה 12');
  });

  it('a virtual location is not an error', async () => {
    expect(await inspectLocationFolder(context(), 'ap12')).toEqual({ state: 'virtual' });
  });

  it('a deleted folder is flagged, never silently replaced, and is rebuilt only on request', async () => {
    const folderId = await ensureLocationFolder(context(), 'ap12');
    provider.folders.delete(folderId);
    expect(await inspectLocationFolder(context(), 'ap12')).toEqual({ state: 'missing' });
    const created = provider.created;
    await expect(ensureLocationFolder(context(), 'ap12')).rejects.toMatchObject({ messageKey: 'infraMapping.errors.folderMissing' });
    expect(provider.created).toBe(created);

    const rebuilt = await recreateMissingFolder(context(), 'ap12');
    expect(rebuilt).not.toBe(folderId);
    expect(store.forLocation('ap12')?.externalFolderId).toBe(rebuilt);
    expect(store.forLocation('ap12')?.status).toBe('ready');
  });
});

/**
 * Folder service against an in-memory provider tree and mapping store (no database, no network).
 * Proves: location tree == cloud folder tree, bulk creation, idempotency, rename / move keep the
 * photo<->folder link, linking an existing folder, and recovery from a deleted folder.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ensureInfraRoot,
  ensureLocationFolder,
  linkExistingFolder,
  moveLocationFolder,
  renameLocationFolder,
  syncLocationFolders,
  type FolderAdapter,
  type FolderContext,
  type FolderItem,
  type FolderMappingStore,
} from '@/modules/infra-mapping/application/folders';
import type { FolderMappingRow } from '@/modules/infra-mapping/data/infra.repository';

type Node = { id: string; parentId: string | null; name: string; code: string | null; archived?: boolean };

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

describe('infrastructure folders in the customer cloud', () => {
  let provider: FakeProvider;
  let store: FakeStore;
  let projectFolder: FolderItem;
  let tree: Node[];
  const context = (): FolderContext => ({ adapter: provider, store, projectFolderId: projectFolder.id, tree });

  beforeEach(() => {
    provider = new FakeProvider();
    store = new FakeStore();
    projectFolder = provider.seed('פרויקט א', null);
    tree = [
      { id: 'bldA', parentId: null, name: 'בניין א', code: null },
      { id: 'fl3', parentId: 'bldA', name: 'קומה 3', code: null },
      { id: 'ap12', parentId: 'fl3', name: 'דירה 12', code: null },
      { id: 'bldB', parentId: null, name: 'בניין ב', code: null },
    ];
  });

  it('creates the root and the full ancestor chain as real nested folders', async () => {
    const folderId = await ensureLocationFolder(context(), 'ap12');
    expect(provider.pathOf(folderId)).toBe('פרויקט א/תיעוד תשתיות/בניין א/קומה 3/דירה 12');
    expect(store.forLocation(null)?.status).toBe('ready');
    expect(store.forLocation('ap12')?.externalFolderId).toBe(folderId);
  });

  it('is idempotent: running it again creates nothing', async () => {
    await ensureLocationFolder(context(), 'ap12');
    const before = provider.created;
    await ensureLocationFolder(context(), 'ap12');
    expect(provider.created).toBe(before);
    expect(store.rows).toHaveLength(4);
  });

  it('bulk sync builds the whole tree in paced batches, parents first', async () => {
    tree.push(
      ...Array.from({ length: 6 }, (_, i) => ({ id: `ap-${i}`, parentId: 'fl3', name: `דירה ${i + 20}`, code: null })),
    );
    const total = tree.length;
    let result = await syncLocationFolders(context(), { batchSize: 3 });
    expect(result.processed).toBe(3);
    expect(result.remaining).toBe(total - 3);
    let guard = 0;
    while (result.remaining > 0 && guard < 20) {
      result = await syncLocationFolders(context(), { batchSize: 3 });
      guard += 1;
    }
    expect(result.remaining).toBe(0);
    for (const node of tree) expect(store.forLocation(node.id)?.status).toBe('ready');
    expect(provider.pathOf(store.forLocation('ap-5')!.externalFolderId)).toBe('פרויקט א/תיעוד תשתיות/בניין א/קומה 3/דירה 25');
  });

  it('a failing location is reported and retried, never silently dropped', async () => {
    provider.failCreateFor.add('בניין ב');
    const first = await syncLocationFolders(context(), { batchSize: 20 });
    expect(first.failed.map((item) => item.locationId)).toEqual(['bldB']);
    expect(first.remaining).toBe(1);
    provider.failCreateFor.clear();
    const second = await syncLocationFolders(context(), { batchSize: 20 });
    expect(second.remaining).toBe(0);
    expect(store.forLocation('bldB')?.status).toBe('ready');
  });

  it('archived locations are not synced', async () => {
    tree.push({ id: 'old', parentId: null, name: 'ישן', code: null, archived: true });
    await syncLocationFolders(context(), { batchSize: 40 });
    expect(store.forLocation('old')).toBeUndefined();
  });

  it('two siblings with the same name get distinct folders', async () => {
    tree.push({ id: 'dup1', parentId: 'bldB', name: 'חדר', code: null }, { id: 'dup2', parentId: 'bldB', name: 'חדר', code: null });
    const a = await ensureLocationFolder(context(), 'dup1');
    const b = await ensureLocationFolder(context(), 'dup2');
    expect(a).not.toBe(b);
    expect(provider.pathOf(b)).toMatch(/חדר \(2\)$/);
  });

  it('renaming a location renames its folder but keeps the same folder id (photos stay linked)', async () => {
    const folderId = await ensureLocationFolder(context(), 'fl3');
    tree = tree.map((node) => (node.id === 'fl3' ? { ...node, name: 'קומה שלישית' } : node));
    expect(await renameLocationFolder(context(), 'fl3')).toBe('renamed');
    expect(store.forLocation('fl3')?.externalFolderId).toBe(folderId);
    expect(provider.pathOf(folderId)).toMatch(/קומה שלישית$/);
    expect(await renameLocationFolder(context(), 'fl3')).toBe('unchanged');
  });

  it('moving a location moves the folder (with its content) and keeps ids', async () => {
    const apFolder = await ensureLocationFolder(context(), 'ap12');
    const childMarker = provider.seed('photo.jpg-holder', apFolder);
    await ensureLocationFolder(context(), 'bldB');
    tree = tree.map((node) => (node.id === 'ap12' ? { ...node, parentId: 'bldB' } : node));
    expect(await moveLocationFolder(context(), 'ap12')).toBe('moved');
    expect(store.forLocation('ap12')?.externalFolderId).toBe(apFolder);
    expect(provider.pathOf(apFolder)).toBe('פרויקט א/תיעוד תשתיות/בניין ב/דירה 12');
    expect(provider.folders.get(childMarker.id)?.parentId).toBe(apFolder);
    expect(await moveLocationFolder(context(), 'ap12')).toBe('unchanged');
  });

  it('a location without a folder yet is reported, not invented, by rename / move', async () => {
    expect(await renameLocationFolder(context(), 'bldA')).toBe('no_folder');
    expect(await moveLocationFolder(context(), 'bldA')).toBe('no_folder');
  });

  it('links a folder the customer already has and keeps its own name on rename / move', async () => {
    const existing = provider.seed('התיקייה הישנה של דירה 12', projectFolder.id);
    await ensureInfraRoot(context());
    const row = await linkExistingFolder(context(), { locationId: 'ap12', externalFolderId: existing.id });
    expect(row.origin).toBe('linked_existing');
    tree = tree.map((node) => (node.id === 'ap12' ? { ...node, name: 'דירה 12 (שונה)' } : node));
    expect(await renameLocationFolder(context(), 'ap12')).toBe('unchanged');
    expect(provider.folders.get(existing.id)?.name).toBe('התיקייה הישנה של דירה 12');
    expect(await ensureLocationFolder(context(), 'ap12')).toBe(existing.id);
  });

  it('one provider folder cannot serve two locations', async () => {
    const existing = provider.seed('משותפת', projectFolder.id);
    await linkExistingFolder(context(), { locationId: 'bldA', externalFolderId: existing.id });
    await expect(linkExistingFolder(context(), { locationId: 'bldB', externalFolderId: existing.id })).rejects.toMatchObject({
      messageKey: 'infraMapping.errors.folderInUse',
    });
  });

  it('linking a missing folder or an unknown location fails clearly', async () => {
    await expect(linkExistingFolder(context(), { locationId: 'bldA', externalFolderId: 'nope' })).rejects.toThrow();
    const existing = provider.seed('x', projectFolder.id);
    await expect(linkExistingFolder(context(), { locationId: 'ghost', externalFolderId: existing.id })).rejects.toThrow();
  });

  it('rebuilds a folder the customer deleted in the cloud', async () => {
    const folderId = await ensureLocationFolder(context(), 'fl3');
    provider.folders.delete(folderId);
    const rebuilt = await ensureLocationFolder(context(), 'fl3');
    expect(rebuilt).not.toBe(folderId);
    expect(store.forLocation('fl3')?.externalFolderId).toBe(rebuilt);
  });
});

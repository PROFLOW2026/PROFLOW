/**
 * Two uploads to the same NEW location at the same time (also from different server instances) must end with
 * exactly one cloud folder. Serialization is a Postgres transaction advisory lock (`withFolderLock`), which is
 * shared by every instance; here the database lock is modelled by a queue and the provider allows same-name
 * folders (like Google Drive), so any missing serialization shows up as a duplicate.
 */
import { describe, expect, it } from 'vitest';
import {
  ensureLocationFolder,
  type FolderAdapter,
  type FolderContext,
  type FolderItem,
  type FolderMappingStore,
} from '@/modules/infra-mapping/application/folders';
import type { FolderMappingRow } from '@/modules/infra-mapping/data/infra.repository';
import type { PlacementNode } from '@/modules/infra-mapping/domain/folder-placement';
import { withFolderLock } from '@/modules/infra-mapping/server';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 1));

class SlowProvider implements FolderAdapter {
  folders = new Map<string, FolderItem>();
  private seq = 0;
  seed(name: string, parentId: string | null) {
    const folder = { id: `f${++this.seq}`, name, parentId };
    this.folders.set(folder.id, folder);
    return folder;
  }
  async getFolder(id: string) {
    await tick();
    return this.folders.get(id) ?? null;
  }
  async findChildByName(parentId: string, name: string) {
    await tick();
    return [...this.folders.values()].find((f) => f.parentId === parentId && f.name === name) ?? null;
  }
  async createFolder(input: { name: string; parentId: string }) {
    await tick();
    return this.seed(input.name, input.parentId);
  }
  async renameFolder(id: string, name: string) {
    return { ...this.folders.get(id)!, name };
  }
  async moveFolder(id: string, parentId: string) {
    return { ...this.folders.get(id)!, parentId };
  }
}

/** Mapping rows shared by both "instances" (the database); every call is slow so interleaving is real. */
class SharedStore implements FolderMappingStore {
  rows: FolderMappingRow[] = [];
  private seq = 0;
  async list() {
    await tick();
    return this.rows.map((row) => ({ ...row }));
  }
  async insert(row: Parameters<FolderMappingStore['insert']>[0]) {
    await tick();
    const created = { id: `m${++this.seq}`, ...row } as unknown as FolderMappingRow;
    this.rows.push(created);
    return { ...created };
  }
  async update(id: string, patch: Parameters<FolderMappingStore['update']>[1]) {
    this.rows = this.rows.map((row) => (row.id === id ? ({ ...row, ...patch } as FolderMappingRow) : row));
  }
  async remove(id: string) {
    this.rows = this.rows.filter((row) => row.id !== id);
  }
}

const tree: PlacementNode[] = [
  { id: 'b', parentId: null, name: 'בניין א', code: null, type: 'building' },
  { id: 'f1', parentId: 'b', name: 'קומה 1', code: null, type: 'floor' },
  { id: 'u1', parentId: 'f1', name: 'דירה 1', code: null, type: 'apartment' },
];

function instance(provider: SlowProvider, store: SharedStore, projectFolderId: string): FolderContext {
  return { adapter: provider, store, tree, getProjectFolderId: async () => projectFolderId };
}

/** Models `pg_advisory_xact_lock`: a second transaction waits until the first one commits. */
function fakeDb() {
  let tail: Promise<void> = Promise.resolve();
  const executed: string[] = [];
  return {
    executed,
    /** Runs `work` as one transaction holding the lock until it finishes. */
    async transaction<T>(work: (db: { execute: (query: unknown) => Promise<void> }) => Promise<T>): Promise<T> {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => (release = resolve));
      let locked = false;
      const db = {
        async execute(query: unknown) {
          executed.push(JSON.stringify(query));
          if (!locked) {
            locked = true;
            await previous; // blocks while another transaction holds the lock
          }
        },
      };
      try {
        return await work(db);
      } finally {
        if (!locked) await previous;
        release();
      }
    },
  };
}

describe('parallel first uploads to the same new location', () => {
  it('without serialization the race really produces duplicate folders (the risk is real)', async () => {
    const provider = new SlowProvider();
    const store = new SharedStore();
    const project = provider.seed('פרויקט', null);
    const [a, b] = await Promise.all([
      ensureLocationFolder(instance(provider, store, project.id), 'u1'),
      ensureLocationFolder(instance(provider, store, project.id), 'u1'),
    ]);
    const unitFolders = [...provider.folders.values()].filter((f) => f.name === 'דירה 1');
    expect(unitFolders.length).toBeGreaterThan(1);
    expect(a).not.toBe(b);
  });

  it('with the per-project lock, two instances end with ONE folder per location and the same id', async () => {
    const provider = new SlowProvider();
    const store = new SharedStore();
    const project = provider.seed('פרויקט', null);
    const database = fakeDb();
    const scope = { organizationId: 'org-1', projectId: 'p1' };

    const upload = () =>
      database.transaction((db) =>
        withFolderLock(db as never, scope, () => ensureLocationFolder(instance(provider, store, project.id), 'u1')),
      );
    const [a, b, c] = await Promise.all([upload(), upload(), upload()]);

    expect(new Set([a, b, c]).size).toBe(1);
    for (const name of ['תיעוד תשתיות', 'בניין א', 'יחידות', 'דירה 1']) {
      expect([...provider.folders.values()].filter((f) => f.name === name)).toHaveLength(1);
    }
    expect(store.rows.filter((row) => row.locationId === 'u1')).toHaveLength(1);
  });

  it('the lock is a transaction-scoped Postgres advisory lock keyed by organization + project', async () => {
    const database = fakeDb();
    await database.transaction((db) => withFolderLock(db as never, { organizationId: 'org-1', projectId: 'p1' }, async () => undefined));
    await database.transaction((db) => withFolderLock(db as never, { organizationId: 'org-2', projectId: 'p1' }, async () => undefined));
    expect(database.executed[0]).toContain('pg_advisory_xact_lock');
    expect(database.executed[0]).toContain('infra-folders:org-1:p1');
    expect(database.executed[1]).toContain('infra-folders:org-2:p1');
  });
});

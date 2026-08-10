import type { OfflineDraftRecord } from '../domain/types';

const DB_NAME = 'projectflow-offline';
const DB_VERSION = 2;
const STORE_NAME = 'drafts';

export interface DraftStore {
  put(record: OfflineDraftRecord): Promise<void>;
  get(localId: string): Promise<OfflineDraftRecord | undefined>;
  list(organizationId?: string): Promise<OfflineDraftRecord[]>;
  delete(localId: string): Promise<void>;
  clear(organizationId?: string): Promise<void>;
}

/** Normalize legacy rows written before user scoping / dedupe keys existed. */
export function normalizeDraftRecord(raw: OfflineDraftRecord): OfflineDraftRecord {
  return {
    ...raw,
    userId: typeof raw.userId === 'string' ? raw.userId : '',
    dedupeKey: typeof raw.dedupeKey === 'string' ? raw.dedupeKey : raw.dedupeKey ?? null,
    conflictReason: raw.conflictReason ?? null,
    serverSnapshot: raw.serverSnapshot ?? null,
    serverId: raw.serverId ?? null,
    serverUpdatedAt: raw.serverUpdatedAt ?? null,
  };
}

/** In-memory store for unit tests and non-browser environments. */
export function createMemoryDraftStore(
  seed: readonly OfflineDraftRecord[] = [],
): DraftStore {
  const map = new Map<string, OfflineDraftRecord>();
  for (const record of seed) {
    map.set(record.localId, structuredClone(normalizeDraftRecord(record)));
  }

  return {
    async put(record) {
      map.set(record.localId, structuredClone(normalizeDraftRecord(record)));
    },
    async get(localId) {
      const found = map.get(localId);
      return found ? structuredClone(found) : undefined;
    },
    async list(organizationId) {
      const all = [...map.values()].map((r) => structuredClone(r));
      const filtered = organizationId
        ? all.filter((r) => r.organizationId === organizationId)
        : all;
      return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async delete(localId) {
      map.delete(localId);
    },
    async clear(organizationId) {
      if (!organizationId) {
        map.clear();
        return;
      }
      for (const [id, record] of map) {
        if (record.organizationId === organizationId) map.delete(id);
      }
    },
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Failed to open offline DB.'));
    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;
      let store: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        store = db.createObjectStore(STORE_NAME, { keyPath: 'localId' });
        store.createIndex('organizationId', 'organizationId', { unique: false });
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
        store.createIndex('kind', 'kind', { unique: false });
        store.createIndex('userId', 'userId', { unique: false });
      } else if (tx) {
        store = tx.objectStore(STORE_NAME);
        if (!store.indexNames.contains('userId')) {
          store.createIndex('userId', 'userId', { unique: false });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

/** Browser IndexedDB-backed draft store. */
export function createIndexedDbDraftStore(): DraftStore {
  return {
    async put(record) {
      const db = await openDb();
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        await idbRequest(
          tx.objectStore(STORE_NAME).put(structuredClone(normalizeDraftRecord(record))),
        );
      } finally {
        db.close();
      }
    },
    async get(localId) {
      const db = await openDb();
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const result = await idbRequest(
          tx.objectStore(STORE_NAME).get(localId) as IDBRequest<OfflineDraftRecord | undefined>,
        );
        return result ? structuredClone(normalizeDraftRecord(result)) : undefined;
      } finally {
        db.close();
      }
    },
    async list(organizationId) {
      const db = await openDb();
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        let rows: OfflineDraftRecord[];
        if (organizationId) {
          const index = store.index('organizationId');
          rows = await idbRequest(
            index.getAll(organizationId) as IDBRequest<OfflineDraftRecord[]>,
          );
        } else {
          rows = await idbRequest(store.getAll() as IDBRequest<OfflineDraftRecord[]>);
        }
        return rows
          .map((r) => structuredClone(normalizeDraftRecord(r)))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      } finally {
        db.close();
      }
    },
    async delete(localId) {
      const db = await openDb();
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        await idbRequest(tx.objectStore(STORE_NAME).delete(localId));
      } finally {
        db.close();
      }
    },
    async clear(organizationId) {
      const db = await openDb();
      try {
        if (!organizationId) {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          await idbRequest(tx.objectStore(STORE_NAME).clear());
          return;
        }
        const existing = await this.list(organizationId);
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        await Promise.all(existing.map((row) => idbRequest(store.delete(row.localId))));
      } finally {
        db.close();
      }
    },
  };
}

let browserStore: DraftStore | null = null;

/**
 * Returns the browser IndexedDB store when available, otherwise an in-memory
 * fallback (SSR / tests without IDB).
 */
export function getDefaultDraftStore(): DraftStore {
  if (typeof indexedDB === 'undefined') {
    return createMemoryDraftStore();
  }
  if (!browserStore) {
    browserStore = createIndexedDbDraftStore();
  }
  return browserStore;
}

/** Test helper — resets the singleton so suites do not leak IDB state. */
export function resetDefaultDraftStoreForTests(): void {
  browserStore = null;
}

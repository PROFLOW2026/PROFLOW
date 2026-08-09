/**
 * Local blob store for offline photo/document capture.
 * Separate IndexedDB from draft metadata so blobs never inflate draft JSON.
 */

export interface OfflineAttachmentRecord {
  readonly localId: string;
  readonly organizationId: string;
  /** Draft `localId` this blob belongs to. */
  readonly draftLocalId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
  readonly blob: Blob;
}

export interface AttachmentStore {
  put(record: OfflineAttachmentRecord): Promise<void>;
  get(localId: string): Promise<OfflineAttachmentRecord | undefined>;
  listByDraft(draftLocalId: string): Promise<OfflineAttachmentRecord[]>;
  delete(localId: string): Promise<void>;
  deleteByDraft(draftLocalId: string): Promise<void>;
}

const DB_NAME = 'projectflow-offline-blobs';
const DB_VERSION = 1;
const STORE_NAME = 'attachments';

function newLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createAttachmentLocalId(): string {
  return newLocalId();
}

export function createMemoryAttachmentStore(
  seed: readonly OfflineAttachmentRecord[] = [],
): AttachmentStore {
  const map = new Map<string, OfflineAttachmentRecord>();
  for (const record of seed) {
    map.set(record.localId, record);
  }

  return {
    async put(record) {
      map.set(record.localId, record);
    },
    async get(localId) {
      return map.get(localId);
    },
    async listByDraft(draftLocalId) {
      return [...map.values()].filter((r) => r.draftLocalId === draftLocalId);
    },
    async delete(localId) {
      map.delete(localId);
    },
    async deleteByDraft(draftLocalId) {
      for (const [id, record] of map) {
        if (record.draftLocalId === draftLocalId) map.delete(id);
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
    request.onerror = () => reject(request.error ?? new Error('Failed to open offline blob DB.'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'localId' });
        store.createIndex('draftLocalId', 'draftLocalId', { unique: false });
        store.createIndex('organizationId', 'organizationId', { unique: false });
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

export function createIndexedDbAttachmentStore(): AttachmentStore {
  return {
    async put(record) {
      const db = await openDb();
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        await idbRequest(tx.objectStore(STORE_NAME).put(record));
      } finally {
        db.close();
      }
    },
    async get(localId) {
      const db = await openDb();
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        return await idbRequest(
          tx.objectStore(STORE_NAME).get(localId) as IDBRequest<OfflineAttachmentRecord | undefined>,
        );
      } finally {
        db.close();
      }
    },
    async listByDraft(draftLocalId) {
      const db = await openDb();
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const index = tx.objectStore(STORE_NAME).index('draftLocalId');
        return await idbRequest(
          index.getAll(draftLocalId) as IDBRequest<OfflineAttachmentRecord[]>,
        );
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
    async deleteByDraft(draftLocalId) {
      const existing = await this.listByDraft(draftLocalId);
      const db = await openDb();
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        await Promise.all(existing.map((row) => idbRequest(store.delete(row.localId))));
      } finally {
        db.close();
      }
    },
  };
}

let browserStore: AttachmentStore | null = null;

export function getDefaultAttachmentStore(): AttachmentStore {
  if (typeof indexedDB === 'undefined') {
    return createMemoryAttachmentStore();
  }
  if (!browserStore) {
    browserStore = createIndexedDbAttachmentStore();
  }
  return browserStore;
}

export function resetDefaultAttachmentStoreForTests(): void {
  browserStore = null;
}

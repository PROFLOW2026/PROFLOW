import type { DbExecutor } from '@/shared/db/types';

/**
 * Ports for project files (evidence, drawing revisions). The production adapter (`../server.ts`)
 * talks to the org's configured external storage provider; tests inject an in-memory fake.
 * There is exactly one storage product: these ports never introduce a second one.
 */

export type ProjectFileFolder = 'photos' | 'general_files' | 'plans' | 'documents';

export interface StorageConnectionRef {
  readonly connectionId: string;
  readonly provider: string;
}

export interface StoredFile {
  readonly connectionId: string;
  readonly provider: string;
  readonly externalFileId: string;
  readonly externalParentFolderId: string | null;
  readonly etag: string | null;
  readonly sizeBytes: number;
  readonly checksum: string;
}

export interface OpenedFile {
  readonly stream: ReadableStream<Uint8Array>;
  readonly mimeType: string;
  readonly sizeBytes: number | null;
  readonly httpStatus: number;
  readonly contentRange: string | null;
}

export interface ProjectFileStore {
  /** Throws ServiceUnavailableError('externalStorage.errors.notConnected') when the org has no storage. */
  resolveConnection(organizationId: string): Promise<StorageConnectionRef>;
  /** Writes bytes into the project's semantic folder; never into another org / project. */
  put(input: {
    readonly organizationId: string;
    readonly projectId: string;
    /** The pending `documents` row these bytes belong to. */
    readonly documentId: string;
    readonly folder: ProjectFileFolder;
    readonly fileName: string;
    readonly mimeType: string;
    readonly bytes: Uint8Array;
  }): Promise<StoredFile>;
  /** Streams an available document's bytes (caller already authorized the document). */
  open(input: {
    readonly organizationId: string;
    readonly documentId: string;
    readonly rangeHeader?: string | null;
  }): Promise<OpenedFile>;
}

/**
 * Runs trusted writes on documents / document_links / storage_files after the use-case has
 * authorized the caller (project capability or contractor grant). Production: committed
 * service-role transaction; tests: the PGlite service handle.
 */
export type ElevatedRunner = <T>(fn: (db: DbExecutor) => Promise<T>) => Promise<T>;

export interface ProjectFileDeps {
  readonly store: ProjectFileStore;
  readonly elevated: ElevatedRunner;
}

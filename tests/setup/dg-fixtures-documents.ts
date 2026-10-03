import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { ElevatedRunner, ProjectFileDeps, ProjectFileStore, StoredFile } from '@/modules/evidence';
import type { DbExecutor, Transaction } from '@/shared/db/types';

/**
 * Track IJ test helpers. The fake store never talks to a provider; the elevated runner switches the
 * caller's PGlite transaction to `service_role` for the trusted documents writes and back again
 * (production uses a separate committed service-role transaction).
 */

export const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x03]);
export const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
export const HTML_BYTES = new TextEncoder().encode('<!doctype html><script>alert(1)</script>');

export interface FakeFileStore extends ProjectFileStore {
  readonly files: Map<string, { bytes: Uint8Array; projectId: string; folder: string; fileName: string }>;
}

export function createFakeFileStore(connection: { connectionId: string; provider?: string }): FakeFileStore {
  const files: FakeFileStore['files'] = new Map();
  const provider = connection.provider ?? 'onedrive';
  return {
    files,
    async resolveConnection() {
      return { connectionId: connection.connectionId, provider };
    },
    async put(input): Promise<StoredFile> {
      files.set(input.documentId, {
        bytes: input.bytes,
        projectId: input.projectId,
        folder: input.folder,
        fileName: input.fileName,
      });
      return {
        connectionId: connection.connectionId,
        provider,
        externalFileId: `fake-${randomUUID()}`,
        externalParentFolderId: `folder-${input.projectId}-${input.folder}`,
        etag: 'etag-1',
        sizeBytes: input.bytes.length,
        checksum: createHash('sha256').update(input.bytes).digest('hex'),
      };
    },
    async open(input) {
      const file = files.get(input.documentId);
      if (!file) throw new Error('fake store: file missing');
      return {
        stream: new Response(Buffer.from(file.bytes)).body!,
        mimeType: 'application/octet-stream',
        sizeBytes: file.bytes.length,
        httpStatus: 200,
        contentRange: null,
      };
    },
  };
}

export function elevatedFor(tx: Transaction): ElevatedRunner {
  return async <T>(fn: (db: DbExecutor) => Promise<T>): Promise<T> => {
    await tx.execute(sql`set local role service_role`);
    const result = await fn(tx);
    await tx.execute(sql`set local role authenticated`);
    return result;
  };
}

export function depsFor(tx: Transaction, store: ProjectFileStore): ProjectFileDeps {
  return { store, elevated: elevatedFor(tx) };
}

export async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

import 'server-only';

import { createHash } from 'node:crypto';
import { takeoffNotFound } from '../domain/errors';
import type { TakeoffFileStore } from '../ports';
import { resetTakeoffOrgFileStoreForTests } from './takeoff-org-file-store';

type BlobRecord = {
  bytes: Uint8Array;
  mimeType: string;
  projectId: string;
  fileName: string;
  documentId?: string;
};

const chunkParts = new Map<string, Map<number, Uint8Array>>();
const blobs = new Map<string, BlobRecord>();

export function resetTakeoffFileStoreForTests(): void {
  chunkParts.clear();
  blobs.clear();
  resetTakeoffOrgFileStoreForTests();
}

function mimeForKind(kind: string): string {
  if (kind === 'pdf') return 'application/pdf';
  if (kind === 'dwg') return 'image/vnd.dwg';
  return 'application/dxf';
}

export function createInMemoryTakeoffFileStore(): TakeoffFileStore {
  return {
    async putChunk(input) {
      const bucket = chunkParts.get(input.fileId) ?? new Map<number, Uint8Array>();
      bucket.set(input.offset, input.bytes);
      chunkParts.set(input.fileId, bucket);
      const nextOffset = input.offset + input.bytes.length;
      return { done: nextOffset >= input.totalBytes, nextOffset, session: `${input.fileId}:${nextOffset}` };
    },
    async finalize(input) {
      const bucket = chunkParts.get(input.fileId);
      if (!bucket) takeoffNotFound();
      const ordered = [...bucket.entries()].sort((a, b) => a[0] - b[0]);
      const bytes = Buffer.concat(ordered.map(([, b]) => Buffer.from(b)));
      const sha = createHash('sha256').update(bytes).digest('hex');
      if (sha !== input.sha256) throw new Error('sha mismatch');
      blobs.set(input.fileId, {
        bytes,
        mimeType: input.mimeType,
        projectId: input.projectId,
        fileName: input.fileName,
      });
      chunkParts.delete(input.fileId);
      return {};
    },
    async openReadStream(input) {
      const rec = blobs.get(input.fileId);
      if (!rec) takeoffNotFound();
      return streamFromBytes(rec.bytes, rec.mimeType, input.rangeHeader);
    },
    async putArtifact(input) {
      blobs.set(input.artifactKey, {
        bytes: input.bytes,
        mimeType: input.mimeType,
        projectId: input.projectId,
        fileName: input.name,
      });
      return { artifactKey: input.artifactKey };
    },
  };
}

export { createOrgCloudTakeoffFileStore } from './takeoff-org-file-store';
export { createEphemeralDiskTakeoffFileStore, purgeEphemeralTakeoffBytes } from './takeoff-ephemeral-file-store';

function streamFromBytes(bytes: Uint8Array, mimeType: string, rangeHeader: string | null) {
  if (!rangeHeader) {
    return {
      body: new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(bytes);
          c.close();
        },
      }),
      contentType: mimeType,
      contentLength: bytes.length,
    };
  }
  const m = /bytes=(\d+)-(\d+)?/.exec(rangeHeader);
  const start = m ? Number(m[1]) : 0;
  const end = m && m[2] ? Number(m[2]) : bytes.length - 1;
  const slice = bytes.subarray(start, end + 1);
  return {
    body: new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(slice);
        c.close();
      },
    }),
    contentType: mimeType,
    contentLength: slice.length,
  };
}

export { mimeForKind };
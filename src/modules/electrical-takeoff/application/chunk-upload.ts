import { createHash } from 'node:crypto';
import { TakeoffError } from '../domain/errors';
import { assertMagicMatchesDeclared } from './magic-bytes';
import type { TakeoffChunkSession, TakeoffFileStore } from '../ports';
import { TAKEOFF_CHUNK_BYTES, TAKEOFF_MAX_FILE_BYTES, findFile, updateFileUpload } from '../data/takeoff.repository';
import { mimeForKind } from './takeoff-file-store';
import type { TakeoffSourceKind } from '../domain/contracts';
import type { DbExecutor } from '@/shared/db/types';

const chunkBuffers = new Map<string, Uint8Array[]>();

export const TAKEOFF_UPLOAD_HEADERS = {
  offset: 'x-takeoff-offset',
  total: 'x-takeoff-total',
  session: 'x-takeoff-session',
} as const;

export interface ChunkUploadInput {
  db: DbExecutor;
  store: TakeoffFileStore;
  organizationId: string;
  projectId: string;
  fileId: string;
  kind: TakeoffSourceKind;
  offset: number;
  totalBytes: number;
  sessionRaw: string | null;
  bytes: Uint8Array;
}

function encodeSession(session: TakeoffChunkSession): string {
  return Buffer.from(JSON.stringify(session)).toString('base64url');
}

function decodeSession(raw: string | null): TakeoffChunkSession | null {
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as TakeoffChunkSession;
  } catch {
    return null;
  }
}

export async function handleTakeoffChunk(input: ChunkUploadInput): Promise<{ done: boolean; nextOffset: number; session: string }> {
  if (input.totalBytes > TAKEOFF_MAX_FILE_BYTES) throw new TakeoffError('file_too_large');
  if (input.bytes.length > TAKEOFF_CHUNK_BYTES) throw new TakeoffError('file_too_large');
  const session = decodeSession(input.sessionRaw);
  if (session && session.fileId !== input.fileId) throw new TakeoffError('forbidden');
  if (session && session.offset !== input.offset) throw new TakeoffError('revision_conflict');

  if (input.offset === 0) {
    if (!assertMagicMatchesDeclared(input.bytes, input.kind)) throw new TakeoffError('file_type_unsupported');
    chunkBuffers.set(input.fileId, []);
  }

  const parts = chunkBuffers.get(input.fileId) ?? [];
  parts.push(input.bytes);
  chunkBuffers.set(input.fileId, parts);

  const nextOffset = input.offset + input.bytes.length;
  const done = nextOffset >= input.totalBytes;
  const nextSession: TakeoffChunkSession = { fileId: input.fileId, offset: nextOffset, totalBytes: input.totalBytes };
  const sealed = encodeSession(nextSession);

  const storeResult = await input.store.putChunk({
    organizationId: input.organizationId,
    projectId: input.projectId,
    fileId: input.fileId,
    offset: input.offset,
    totalBytes: input.totalBytes,
    bytes: input.bytes,
    session,
  });

  if (done) {
    const all = Buffer.concat(parts);
    const sha256 = createHash('sha256').update(all).digest('hex');
    const row = await findFile(input.db, input.organizationId, input.fileId);
    const fileName = row?.name ?? `${input.fileId}.bin`;
    const mimeType = row?.mimeType ?? mimeForKind(input.kind);
    const stored = await input.store.finalize({
      organizationId: input.organizationId,
      projectId: input.projectId,
      fileId: input.fileId,
      fileName,
      mimeType,
      sha256,
      bytes: new Uint8Array(all),
    });
    await updateFileUpload(input.db, input.organizationId, input.fileId, {
      uploadState: 'complete',
      sha256,
      sizeBytes: input.totalBytes,
      mimeType,
      storageDocumentId: stored.documentId ?? null,
    });
    chunkBuffers.delete(input.fileId);
  } else {
    await updateFileUpload(input.db, input.organizationId, input.fileId, { uploadState: 'uploading' });
  }

  return { done, nextOffset: storeResult.nextOffset ?? nextOffset, session: sealed };
}

export function resetChunkBuffersForTests(): void {
  chunkBuffers.clear();
}
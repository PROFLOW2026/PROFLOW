import 'server-only';

import { randomUUID } from 'node:crypto';
import { createPendingProjectDocument, markProjectDocumentStored } from '@/modules/evidence/application/document-records';
import { externalProviderFileStore } from '@/modules/evidence/server';
import { runCommittedStorageWrite } from '@/modules/external-storage/server';
import { takeoffNotFound } from '../domain/errors';
import type { TakeoffFileStore } from '../ports';
import { findArtifactByJobAndName, findFile } from '../data/takeoff.repository';

const chunkParts = new Map<string, Map<number, Uint8Array>>();

export function resetTakeoffOrgFileStoreForTests(): void {
  chunkParts.clear();
}

async function resolveDocumentId(organizationId: string, fileOrArtifactKey: string): Promise<string> {
  return runCommittedStorageWrite(async (db) => {
    const colon = fileOrArtifactKey.indexOf(':');
    if (colon > 0) {
      const jobId = fileOrArtifactKey.slice(0, colon);
      const name = fileOrArtifactKey.slice(colon + 1);
      const artifact = await findArtifactByJobAndName(db, organizationId, jobId, name);
      if (artifact?.evidenceId) return artifact.evidenceId;
      if (artifact) throw takeoffNotFound();
    }
    const file = await findFile(db, organizationId, fileOrArtifactKey);
    if (file?.storageDocumentId) return file.storageDocumentId;
    if (file) return file.id;
    throw takeoffNotFound();
  });
}

/** Org storage: bytes in the org's primary cloud folder (`plans`); auth via `documents` + RLS. */
export function createOrgCloudTakeoffFileStore(): TakeoffFileStore {
  return {
    async putChunk(input) {
      const bucket = chunkParts.get(input.fileId) ?? new Map<number, Uint8Array>();
      bucket.set(input.offset, input.bytes);
      chunkParts.set(input.fileId, bucket);
      const nextOffset = input.offset + input.bytes.length;
      return { done: nextOffset >= input.totalBytes, nextOffset, session: `${input.fileId}:${nextOffset}` };
    },

    async finalize(input) {
      const stored = await runCommittedStorageWrite(async (db) => {
        const put = await externalProviderFileStore.put({
          organizationId: input.organizationId,
          projectId: input.projectId,
          documentId: input.fileId,
          folder: 'plans',
          fileName: input.fileName,
          mimeType: input.mimeType,
          bytes: input.bytes,
        });
        await markProjectDocumentStored(db, {
          organizationId: input.organizationId,
          documentId: input.fileId,
          fileName: input.fileName,
          mimeType: input.mimeType,
          stored: put,
          uploadedByUserId: null,
        });
        return put;
      });
      chunkParts.delete(input.fileId);
      return { documentId: input.fileId, sizeBytes: stored.sizeBytes };
    },

    async openReadStream(input) {
      const documentId = await resolveDocumentId(input.organizationId, input.fileId);
      const opened = await externalProviderFileStore.open({
        organizationId: input.organizationId,
        documentId,
        rangeHeader: input.rangeHeader,
      });
      return {
        body: opened.stream,
        contentType: opened.mimeType,
        contentLength: opened.sizeBytes,
      };
    },

    async putArtifact(input) {
      const documentId = randomUUID();
      await runCommittedStorageWrite(async (db) => {
        const connection = await externalProviderFileStore.resolveConnection(input.organizationId);
        await createPendingProjectDocument(db, {
          documentId,
          organizationId: input.organizationId,
          connection,
          fileName: input.name,
          mimeType: input.mimeType,
          sizeBytes: input.bytes.length,
          uploadedByUserId: null,
          owner: { type: 'project', id: input.projectId },
          label: 'takeoff_artifact',
        });
        const put = await externalProviderFileStore.put({
          organizationId: input.organizationId,
          projectId: input.projectId,
          documentId,
          folder: 'plans',
          fileName: input.name,
          mimeType: input.mimeType,
          bytes: input.bytes,
        });
        await markProjectDocumentStored(db, {
          organizationId: input.organizationId,
          documentId,
          fileName: input.name,
          mimeType: input.mimeType,
          stored: put,
          uploadedByUserId: null,
        });
      });
      return { artifactKey: input.artifactKey, documentId };
    },
  };
}
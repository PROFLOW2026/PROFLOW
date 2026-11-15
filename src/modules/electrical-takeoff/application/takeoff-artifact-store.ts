import 'server-only';

import type { StoragePort } from '@/shared/ports/storage';
import { getStoragePort } from '@/shared/ports/storage';
import { takeoffNotFound } from '../domain/errors';
import { findArtifactByJobAndName } from '../data/takeoff.repository';
import { externalProviderFileStore } from '@/modules/evidence/server';
import type { DbExecutor } from '@/shared/db/types';

function storageObjectKey(organizationId: string, jobId: string, artifactName: string): string {
  const safeName = artifactName.replaceAll(/[/\\]/g, '_');
  return `${organizationId}/takeoff-artifacts/${jobId}/${safeName}`;
}

export async function putTakeoffArtifactBytes(input: {
  organizationId: string;
  jobId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<void> {
  const storage = getStoragePort();
  if (!storage.configured) {
    throw new Error('takeoff_artifact_storage_unavailable');
  }
  const key = storageObjectKey(input.organizationId, input.jobId, input.name);
  const upload = await storage.createUploadUrl(key, input.mimeType || 'application/octet-stream');
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET!;
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(
    upload.path,
    upload.token ?? '',
    new Blob([Buffer.from(input.bytes)]),
    { upsert: true },
  );
  if (error) throw new Error(error.message);
}

export async function openTakeoffArtifactReadStream(input: {
  organizationId: string;
  jobId: string;
  artifactName: string;
}): Promise<{ body: ReadableStream<Uint8Array>; contentType: string; contentLength: number } | null> {
  const storage = getStoragePort();
  if (!storage.configured) return null;
  const key = storageObjectKey(input.organizationId, input.jobId, input.artifactName);
  const stored = await storage.downloadBytes(key).catch(() => null);
  if (!stored) return null;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(stored.bytes);
      controller.close();
    },
  });
  return {
    body,
    contentType: stored.contentType || 'application/octet-stream',
    contentLength: stored.size,
  };
}

/** Prefer Supabase artifact bytes; fall back to legacy org-cloud evidence on the artifact row. */
export async function streamTakeoffArtifact(
  db: DbExecutor,
  organizationId: string,
  jobId: string,
  artifactName: string,
  mimeType: string | null,
): Promise<{ body: ReadableStream<Uint8Array>; contentType: string }> {
  const fromSupabase = await openTakeoffArtifactReadStream({ organizationId, jobId, artifactName });
  if (fromSupabase) {
    return { body: fromSupabase.body, contentType: mimeType ?? fromSupabase.contentType };
  }

  const artifact = await findArtifactByJobAndName(db, organizationId, jobId, artifactName);
  if (artifact?.evidenceId) {
    const opened = await externalProviderFileStore.open({
      organizationId,
      documentId: artifact.evidenceId,
      rangeHeader: null,
    });
    return { body: opened.stream, contentType: mimeType ?? opened.mimeType };
  }

  throw takeoffNotFound();
}
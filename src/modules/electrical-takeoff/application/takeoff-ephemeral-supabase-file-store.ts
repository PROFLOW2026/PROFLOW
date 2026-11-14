import 'server-only';

import { createHash } from 'node:crypto';

import type { StoragePort } from '@/shared/ports/storage';
import { takeoffNotFound } from '../domain/errors';
import type { TakeoffFileStore } from '../ports';

function resolveKey(organizationId: string, fileId: string): string {
  return `${organizationId}/takeoff-ephemeral/${fileId}/source.bin`;
}

/** Ephemeral bytes on Supabase Storage (same project bucket) — survives Vercel multi-instance uploads. */
export function createEphemeralSupabaseTakeoffFileStore(storage: StoragePort): TakeoffFileStore {
  return {
    async putChunk(input) {
      const key = resolveKey(input.organizationId, input.fileId);
      let merged: Uint8Array;
      if (input.offset === 0) {
        merged = input.bytes;
      } else {
        const prev = await storage.downloadBytes(key).catch(() => null);
        const base = prev?.bytes ?? new Uint8Array();
        if (base.length !== input.offset) throw new Error('chunk_out_of_order');
        merged = new Uint8Array(base.length + input.bytes.length);
        merged.set(base, 0);
        merged.set(input.bytes, base.length);
      }
      const upload = await storage.createUploadUrl(key, 'application/octet-stream');
      const { createClient } = await import('@supabase/supabase-js');
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const bucket = process.env.SUPABASE_STORAGE_BUCKET!;
      const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(
        upload.path,
        upload.token ?? '',
        new Blob([Buffer.from(merged)]),
        { upsert: true },
      );
      if (error) throw new Error(error.message);
      const nextOffset = input.offset + input.bytes.length;
      return { done: nextOffset >= input.totalBytes, nextOffset, session: `${input.fileId}:${nextOffset}` };
    },

    async finalize(input) {
      const key = resolveKey(input.organizationId, input.fileId);
      const stored = await storage.downloadBytes(key);
      const sha256 = createHash('sha256').update(stored.bytes).digest('hex');
      if (sha256 !== input.sha256) throw new Error('sha mismatch');
      return {};
    },

    async openReadStream(input) {
      const key = resolveKey(input.organizationId, input.fileId);
      const stored = await storage.downloadBytes(key).catch(() => null);
      if (!stored) takeoffNotFound();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(stored.bytes);
          controller.close();
        },
      });
      return {
        body,
        contentType: stored.contentType,
        contentLength: stored.size,
      };
    },
  };
}

export async function purgeEphemeralSupabaseObjects(
  storage: StoragePort,
  organizationId: string,
  fileIds: readonly string[],
): Promise<void> {
  await Promise.all(
    fileIds.map(async (fileId) => {
      const key = resolveKey(organizationId, fileId);
      await storage.remove(key).catch(() => undefined);
    }),
  );
}